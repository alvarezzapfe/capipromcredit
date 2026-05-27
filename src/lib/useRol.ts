"use client";

import { useState, useEffect } from "react";
import { createClient } from "./supabase-client";
import type { Rol } from "./rbac";

export function useRol(): Rol | null {
  const [rol, setRol] = useState<Rol | null>(null);
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("perfiles")
        .select("rol")
        .eq("id", user.id)
        .single();
      setRol((data?.rol as Rol) ?? null);
    })();
  }, []);
  return rol;
}
