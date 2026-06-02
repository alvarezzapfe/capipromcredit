import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getPerfil } from "@/lib/perfil";
import Sidebar from "@/components/Sidebar";
import { DashboardShell } from "@/components/DashboardShell";

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
    <DashboardShell
      sidebar={<Sidebar email={perfil!.email} rol={perfil!.rol} />}
    >
      {children}
    </DashboardShell>
  );
}
