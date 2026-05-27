-- Migrar métodos de amortización existentes
update creditos set metodo_amort = case metodo_amort
  when 'frances' then 'lineal'
  when 'saldos_insolutos' then 'lineal'
  when 'interes_periodico' then 'bullet'
  else metodo_amort
end;

-- Reemplazar check constraint
alter table creditos drop constraint if exists creditos_metodo_amort_check;
alter table creditos add constraint creditos_metodo_amort_check
  check (metodo_amort in ('lineal', 'bullet', 'creciente'));
