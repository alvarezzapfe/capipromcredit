import { createClient } from "./supabase-server";
import type { Rol } from "./rbac";

export async function requireRol(
  allowedRoles: Rol[]
): Promise<{ userId: string; email: string; rol: Rol } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (!data || !allowedRoles.includes(data.rol as Rol)) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    rol: data.rol as Rol,
  };
}
