import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/perfil";

export default async function UsuariosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfil = await getPerfil();
  if (!perfil || perfil.rol !== "super_admin") {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
