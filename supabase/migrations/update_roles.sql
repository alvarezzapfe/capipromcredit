-- Migrar roles existentes a nuevo esquema
update perfiles set rol = 'admin' where rol = 'operador';
update perfiles set rol = 'demo' where rol = 'consulta';
