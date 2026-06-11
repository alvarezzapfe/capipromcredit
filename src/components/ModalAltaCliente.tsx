"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-client";

// Validation helpers
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const RE_CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i;
const RE_PHONE = /^[\d\s+\-()]+$/;

function sanitize(s: string, max: number): string {
  return s.trim().slice(0, max);
}

const formVacio = {
  tipo_persona: "moral" as "fisica" | "moral",
  nombre: "", rfc: "", curp: "", email: "", telefono: "",
  domicilio: "", cp: "", actividad: "",
  representante_legal: "", fecha_constitucion: "", fecha_nacimiento: "",
  notas: "",
  fecha_alta: new Date().toISOString().slice(0, 10),
  contacto_nombre: "", contacto_puesto: "", contacto_telefono: "", contacto_email: "",
};

export function ModalAltaCliente({ isMobile, onClose, onSaved, onCreated }: { isMobile?: boolean; onClose: () => void; onSaved: () => void; onCreated?: (cliente: any) => void }) {
  const [form, setForm] = useState({ ...formVacio });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function guardar() {
    setError(null);
    const nombre = sanitize(form.nombre, 200);
    if (!nombre) { setError("Ingresa el nombre."); return; }

    const rfc = sanitize(form.rfc, 13).toUpperCase();
    if (rfc && !RE_RFC.test(rfc)) { setError("RFC inválido (formato: XAXX010101AAA)."); return; }

    const curp = sanitize(form.curp, 18).toUpperCase();
    if (curp && !RE_CURP.test(curp)) { setError("CURP inválido (18 caracteres alfanuméricos)."); return; }

    const email = sanitize(form.email, 254);
    if (email && !RE_EMAIL.test(email)) { setError("Email inválido."); return; }

    const telefono = sanitize(form.telefono, 20);
    if (telefono && !RE_PHONE.test(telefono)) { setError("Teléfono: solo dígitos, espacios, +, -, ()."); return; }

    const contactoEmail = sanitize(form.contacto_email, 254);
    if (contactoEmail && !RE_EMAIL.test(contactoEmail)) { setError("Email de contacto inválido."); return; }

    const contactoTel = sanitize(form.contacto_telefono, 20);
    if (contactoTel && !RE_PHONE.test(contactoTel)) { setError("Teléfono de contacto inválido."); return; }

    setGuardando(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.from("clientes").insert({
      tipo_persona: form.tipo_persona,
      nombre,
      rfc: rfc || null,
      curp: form.tipo_persona === "fisica" ? (curp || null) : null,
      email: email || null,
      telefono: telefono || null,
      domicilio: sanitize(form.domicilio, 300) || null,
      cp: sanitize(form.cp, 10) || null,
      actividad: sanitize(form.actividad, 200) || null,
      representante_legal: form.tipo_persona === "moral" ? (sanitize(form.representante_legal, 200) || null) : null,
      fecha_constitucion: form.tipo_persona === "moral" && form.fecha_constitucion ? form.fecha_constitucion : null,
      fecha_nacimiento: form.tipo_persona === "fisica" && form.fecha_nacimiento ? form.fecha_nacimiento : null,
      notas: sanitize(form.notas, 2000) || null,
      fecha_alta: form.fecha_alta || new Date().toISOString().slice(0, 10),
      contacto_nombre: sanitize(form.contacto_nombre, 200) || null,
      contacto_puesto: sanitize(form.contacto_puesto, 100) || null,
      contacto_telefono: contactoTel || null,
      contacto_email: contactoEmail || null,
    }).select().single();

    if (err || !data) { setGuardando(false); setError("Error: " + (err?.message ?? "")); return; }

    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("bitacora").insert({ entidad: "cliente", entidad_id: data.id, accion: "creado", detalle: { nombre: data.nombre }, usuario: userData.user?.email ?? "sistema" });

    setGuardando(false);
    if (onCreated) onCreated(data);
    onSaved();
  }

  const sectionTitle = (t: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-faint)", marginBottom: 10, marginTop: 6, borderBottom: "1px solid var(--line-soft)", paddingBottom: 6 }}>{t}</div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,22,40,0.4)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 200, padding: 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "100%", maxWidth: 560, padding: isMobile ? "24px 20px" : "30px 30px", maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#0a1628", marginBottom: 16 }}>Nuevo cliente</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {sectionTitle("Tipo de persona")}
          <div style={{ display: "flex", gap: 6 }}>
            {(["moral", "fisica"] as const).map((t) => (
              <button key={t} onClick={() => set("tipo_persona", t)} style={{ flex: 1, padding: "8px 0", fontSize: 13, fontFamily: "inherit", fontWeight: form.tipo_persona === t ? 600 : 400, border: form.tipo_persona === t ? "1px solid var(--amber)" : "1px solid var(--line)", borderRadius: 6, background: form.tipo_persona === t ? "var(--amber-soft)" : "transparent", color: form.tipo_persona === t ? "var(--amber)" : "var(--text-dim)", cursor: "pointer" }}>
                {t === "moral" ? "Persona moral" : "Persona física"}
              </button>
            ))}
          </div>

          {sectionTitle("Datos generales")}
          <div className="field"><label>{form.tipo_persona === "moral" ? "Razón social *" : "Nombre completo *"}</label><input className="input" maxLength={200} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label>RFC</label><input className="input" maxLength={13} value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} /></div>
            {form.tipo_persona === "fisica" && <div className="field"><label>CURP</label><input className="input" maxLength={18} value={form.curp} onChange={(e) => set("curp", e.target.value.toUpperCase())} /></div>}
            {form.tipo_persona === "moral" && <div className="field"><label>Representante legal</label><input className="input" maxLength={200} value={form.representante_legal} onChange={(e) => set("representante_legal", e.target.value)} /></div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label>Email</label><input className="input" type="email" maxLength={254} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="field"><label>Teléfono</label><input className="input" maxLength={20} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div className="field"><label>Domicilio</label><input className="input" maxLength={300} value={form.domicilio} onChange={(e) => set("domicilio", e.target.value)} /></div>
            <div className="field"><label>C.P.</label><input className="input" maxLength={10} value={form.cp} onChange={(e) => set("cp", e.target.value)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label>Actividad</label><input className="input" maxLength={200} value={form.actividad} onChange={(e) => set("actividad", e.target.value)} /></div>
            {form.tipo_persona === "moral"
              ? <div className="field"><label>Fecha de constitución</label><input className="input mono" type="date" value={form.fecha_constitucion} onChange={(e) => set("fecha_constitucion", e.target.value)} /></div>
              : <div className="field"><label>Fecha de nacimiento</label><input className="input mono" type="date" value={form.fecha_nacimiento} onChange={(e) => set("fecha_nacimiento", e.target.value)} /></div>
            }
          </div>

          <div className="field"><label>Fecha de alta</label><input className="input mono" type="date" value={form.fecha_alta} onChange={(e) => set("fecha_alta", e.target.value)} /></div>

          {sectionTitle("Contacto principal")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label>Nombre</label><input className="input" maxLength={200} value={form.contacto_nombre} onChange={(e) => set("contacto_nombre", e.target.value)} /></div>
            <div className="field"><label>Puesto</label><input className="input" maxLength={100} value={form.contacto_puesto} onChange={(e) => set("contacto_puesto", e.target.value)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label>Teléfono contacto</label><input className="input" maxLength={20} value={form.contacto_telefono} onChange={(e) => set("contacto_telefono", e.target.value)} /></div>
            <div className="field"><label>Email contacto</label><input className="input" type="email" maxLength={254} value={form.contacto_email} onChange={(e) => set("contacto_email", e.target.value)} /></div>
          </div>

          <div className="field"><label>Notas</label><textarea className="textarea" rows={2} maxLength={2000} value={form.notas} onChange={(e) => set("notas", e.target.value)} /></div>

          {error && <div style={{ background: "var(--red-soft)", color: "var(--red)", padding: "10px 14px", borderRadius: 6, fontSize: 13.5 }}>{error}</div>}
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ flex: 1 }}>{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
