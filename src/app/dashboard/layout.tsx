import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getPerfil } from "@/lib/perfil";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const perfil = await getPerfil();

  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar email={perfil!.email} rol={perfil!.rol} />
      <div style={{ flex: 1, minWidth: 0, background: "#fafbfc" }}>
        {children}
      </div>
    </div>
  );
}
