"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { mxn, fecha as fmtFecha, TIPO_PRODUCTO_LABEL, labelEstatus } from "@/lib/format";
import { ModalAltaCliente } from "@/components/ModalAltaCliente";
import { UserCheck, Plus, Upload, Trash2, Download, Search } from "lucide-react";
import { useRol } from "@/lib/useRol";
import { esSoloLectura } from "@/lib/rbac";
import { useIsMobile } from "@/lib/useIsMobile";

interface Cliente {
  id: string;
  tipo_persona: "fisica" | "moral";
  nombre: string;
  rfc: string | null;
  curp: string | null;
  email: string | null;
  telefono: string | null;
  domicilio: string | null;
  cp: string | null;
  actividad: string | null;
  representante_legal: string | null;
  fecha_constitucion: string | null;
  fecha_nacimiento: string | null;
  notas: string | null;
  created_at: string;
}

interface DocCliente {
  id: string;
  cliente_id: string;
  tipo_documento: string;
  nombre_archivo: string;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

const TIPOS_DOC = [
  "acta_constitutiva", "identificacion", "comprobante_domicilio",
  "rfc_cedula", "estados_financieros", "poder_representante", "otro",
] as const;

const LABEL_DOC: Record<string, string> = {
  acta_constitutiva: "Acta constitutiva",
  identificacion: "Identificación",
  comprobante_domicilio: "Comprobante de domicilio",
  rfc_cedula: "RFC / Cédula fiscal",
  estados_financieros: "Estados financieros",
  poder_representante: "Poder del representante",
  otro: "Otro",
};


// =====================================================================
// MAIN
// =====================================================================
export default function Clientes() {
  const isMobile = useIsMobile();
  const rol = useRol();
  const readOnly = rol ? esSoloLectura(rol) : false;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [detalle, setDetalle] = useState<Cliente | null>(null);
  // Counts
  const [creditoCounts, setCreditoCounts] = useState<Record<string, number>>({});
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data } = await supabase.from("clientes").select("*").order("nombre");
    const cls = (data ?? []) as Cliente[];
    setClientes(cls);

    // Fetch credit counts
    if (cls.length > 0) {
      const { data: creds } = await supabase.from("creditos").select("cliente_id");
      const cc: Record<string, number> = {};
      (creds ?? []).forEach((c: any) => { if (c.cliente_id) cc[c.cliente_id] = (cc[c.cliente_id] ?? 0) + 1; });
      setCreditoCounts(cc);

      const { data: docs } = await supabase.from("documentos_cliente").select("cliente_id");
      const dc: Record<string, number> = {};
      (docs ?? []).forEach((d: any) => { if (d.cliente_id) dc[d.cliente_id] = (dc[d.cliente_id] ?? 0) + 1; });
      setDocCounts(dc);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = clientes.filter((c) => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return c.nombre.toLowerCase().includes(q) || (c.rfc ?? "").toLowerCase().includes(q);
  });

  return (
    <div style={{ padding: isMobile ? "20px 16px 40px" : "32px 48px 60px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", marginBottom: isMobile ? 20 : 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="display" style={{ fontSize: 32, marginBottom: 6 }}>Clientes</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>{clientes.length} cliente{clientes.length === 1 ? "" : "s"} registrado{clientes.length === 1 ? "" : "s"}.</p>
        </div>
        {!readOnly && (
          <button className="btn btn-primary" onClick={() => setMostrarAlta(true)}><Plus size={14} strokeWidth={1.75} /> Nuevo cliente</button>
        )}
      </header>

      {/* Search */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ position: "relative", maxWidth: 360 }}>
          <Search size={16} strokeWidth={1.75} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)" }} />
          <input className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o RFC…" style={{ paddingLeft: 36 }} />
        </div>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: 44, textAlign: "center", color: "var(--text-faint)" }}>Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: "80px 40px", textAlign: "center" }}>
            <UserCheck size={36} strokeWidth={1.5} color="#cbd5e1" style={{ margin: "0 auto" }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginTop: 14 }}>{busqueda ? "Sin resultados" : "Sin clientes"}</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{busqueda ? "Intenta otro término." : "Registra tu primer cliente."}</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>RFC</th>
                  <th style={{ textAlign: "right" }}>Créditos</th>
                  <th style={{ textAlign: "right" }}>Docs</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} onClick={() => setDetalle(c)} style={{ cursor: "pointer" }}>
                    <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                    <td><span className="badge" style={{ background: c.tipo_persona === "moral" ? "#e0f2fe" : "#faf5ff", color: c.tipo_persona === "moral" ? "#0284c7" : "#7c3aed", fontSize: 11 }}>{c.tipo_persona === "moral" ? "Moral" : "Física"}</span></td>
                    <td className="mono" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{c.rfc ?? "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{creditoCounts[c.id] ?? 0}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{docCounts[c.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mostrarAlta && <ModalAltaCliente isMobile={isMobile} onClose={() => setMostrarAlta(false)} onSaved={() => { setMostrarAlta(false); cargar(); }} />}
      {detalle && <ModalDetalleCliente cliente={detalle} isMobile={isMobile} readOnly={readOnly} onClose={() => setDetalle(null)} onChanged={() => { cargar(); }} />}
    </div>
  );
}

// =====================================================================
// MODAL: Detalle de cliente (edición + expediente + créditos)
// =====================================================================
function ModalDetalleCliente({ cliente, isMobile, readOnly, onClose, onChanged }: { cliente: Cliente; isMobile?: boolean; readOnly: boolean; onClose: () => void; onChanged: () => void }) {
  const [docs, setDocs] = useState<DocCliente[]>([]);
  const [creditos, setCreditos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  // Upload state
  const [tipoDoc, setTipoDoc] = useState<string>("identificacion");
  const [subiendo, setSubiendo] = useState(false);
  const [errDoc, setErrDoc] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const [d, c] = await Promise.all([
      supabase.from("documentos_cliente").select("*").eq("cliente_id", cliente.id).order("uploaded_at", { ascending: false }),
      supabase.from("creditos").select("id, folio, tipo_producto, monto, estatus").eq("cliente_id", cliente.id).order("created_at", { ascending: false }),
    ]);
    setDocs((d.data ?? []) as DocCliente[]);
    setCreditos(c.data ?? []);
    setCargando(false);
  }, [cliente.id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrDoc(null);
    setSubiendo(true);

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "sistema";
    const path = `${cliente.id}/${Date.now()}_${file.name}`;

    const { error: upErr } = await supabase.storage.from("expedientes").upload(path, file);
    if (upErr) { setSubiendo(false); setErrDoc("Error al subir: " + upErr.message); return; }

    const { error: dbErr } = await supabase.from("documentos_cliente").insert({
      cliente_id: cliente.id,
      tipo_documento: tipoDoc,
      nombre_archivo: file.name,
      storage_path: path,
      uploaded_by: email,
    });
    if (dbErr) { setSubiendo(false); setErrDoc("Error al registrar: " + dbErr.message); return; }

    setSubiendo(false);
    cargar();
    onChanged();
    e.target.value = "";
  }

  async function descargarDoc(doc: DocCliente) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("expedientes").createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) { alert("Error al generar link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function eliminarDoc(doc: DocCliente) {
    if (!confirm("Eliminar " + doc.nombre_archivo + "?")) return;
    const supabase = createClient();
    await supabase.storage.from("expedientes").remove([doc.storage_path]);
    await supabase.from("documentos_cliente").delete().eq("id", doc.id);
    cargar();
    onChanged();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.4)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 100, padding: 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 800, padding: isMobile ? "20px 16px" : "28px 32px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <span className="badge" style={{ background: cliente.tipo_persona === "moral" ? "#e0f2fe" : "#faf5ff", color: cliente.tipo_persona === "moral" ? "#0284c7" : "#7c3aed", fontSize: 11, marginBottom: 6, display: "inline-block" }}>{cliente.tipo_persona === "moral" ? "Persona moral" : "Persona física"}</span>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: "#0a1628", marginTop: 4 }}>{cliente.nombre}</h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "8px 14px" }}>✕</button>
        </div>

        {/* Info */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
          <DatoC label="RFC" valor={cliente.rfc ?? "—"} />
          {cliente.tipo_persona === "fisica" && <DatoC label="CURP" valor={cliente.curp ?? "—"} />}
          {cliente.tipo_persona === "moral" && <DatoC label="Rep. legal" valor={cliente.representante_legal ?? "—"} />}
          <DatoC label="Email" valor={cliente.email ?? "—"} />
          <DatoC label="Teléfono" valor={cliente.telefono ?? "—"} />
          <DatoC label="Actividad" valor={cliente.actividad ?? "—"} />
          {cliente.domicilio && <DatoC label="Domicilio" valor={`${cliente.domicilio}${cliente.cp ? `, CP ${cliente.cp}` : ""}`} />}
        </div>

        {/* Expediente */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", marginBottom: 12 }}>Expediente</h3>
          {!readOnly && (
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginBottom: 12 }}>
              <div className="field" style={{ minWidth: 160 }}>
                <label style={{ fontSize: 11 }}>Tipo</label>
                <select className="select" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} style={{ fontSize: 12.5 }}>
                  {TIPOS_DOC.map((t) => <option key={t} value={t}>{LABEL_DOC[t]}</option>)}
                </select>
              </div>
              <label className="btn btn-ghost" style={{ cursor: "pointer", display: "inline-flex", fontSize: 12.5, padding: "8px 14px" }}>
                <Upload size={14} strokeWidth={1.75} /> {subiendo ? "Subiendo…" : "Subir archivo"}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={subirArchivo} style={{ display: "none" }} disabled={subiendo} />
              </label>
            </div>
          )}
          {errDoc && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "8px 12px", borderRadius: 6, fontSize: 12.5, marginBottom: 8 }}>{errDoc}</div>}
          <div className="panel" style={{ overflow: "hidden" }}>
            {cargando ? <div style={{ padding: 24, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>Cargando…</div>
            : docs.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>Sin documentos. Sube el primer archivo.</div>
            : (
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead><tr><th>Tipo</th><th>Archivo</th><th>Fecha</th><th></th></tr></thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td><span className="badge" style={{ background: "#f0f2f5", color: "#64748b", fontSize: 11 }}>{LABEL_DOC[d.tipo_documento] ?? d.tipo_documento}</span></td>
                      <td style={{ fontSize: 12.5 }}>{d.nombre_archivo}</td>
                      <td style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{new Date(d.uploaded_at).toLocaleDateString("es-MX")}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn btn-ghost" onClick={() => descargarDoc(d)} style={{ padding: "4px 8px", fontSize: 11 }}><Download size={12} /> Ver</button>
                        {!readOnly && <button className="btn btn-ghost" onClick={() => eliminarDoc(d)} style={{ padding: "4px 8px", fontSize: 11, color: "var(--red)" }}><Trash2 size={12} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Créditos ligados */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0a1628", marginBottom: 12 }}>Créditos ligados</h3>
          <div className="panel" style={{ overflow: "hidden" }}>
            {creditos.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>Sin créditos ligados.</div>
            : (
              <table className="table" style={{ fontSize: 12.5 }}>
                <thead><tr><th>Folio</th><th>Producto</th><th style={{ textAlign: "right" }}>Monto</th><th>Estatus</th></tr></thead>
                <tbody>
                  {creditos.map((c: any) => (
                    <tr key={c.id}>
                      <td className="mono" style={{ color: "var(--amber)" }}>{c.folio}</td>
                      <td><span className="badge" style={{ background: "#f0f2f5", color: "#64748b", fontSize: 11 }}>{TIPO_PRODUCTO_LABEL[c.tipo_producto] ?? c.tipo_producto}</span></td>
                      <td className="mono" style={{ textAlign: "right" }}>{mxn(Number(c.monto))}</td>
                      <td><span className={`badge badge-${c.estatus}`}>{labelEstatus[c.estatus]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DatoC({ label, valor }: { label: string; valor: string }) {
  return (<div><div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div><div style={{ fontSize: 14, fontWeight: 500, marginTop: 2, wordBreak: "break-word" }}>{valor}</div></div>);
}
