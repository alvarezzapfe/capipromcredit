export type Rol = "super_admin" | "admin" | "demo";

export const ROLES: Rol[] = ["super_admin", "admin", "demo"];

export function puedeCrear(rol: Rol): boolean {
  return rol === "super_admin" || rol === "admin";
}

export function puedeEliminar(rol: Rol): boolean {
  return rol === "super_admin" || rol === "admin";
}

export function puedeGestionarUsuarios(rol: Rol): boolean {
  return rol === "super_admin";
}

export function esSoloLectura(rol: Rol): boolean {
  return rol === "demo";
}

export function puedeEliminarDesdeTabla(rol: Rol | null): boolean {
  return rol === "super_admin";
}

export function etiquetaRol(rol: Rol): string {
  const labels: Record<Rol, string> = {
    super_admin: "Super admin",
    admin: "Admin",
    demo: "Demo (solo lectura)",
  };
  return labels[rol] ?? rol;
}
