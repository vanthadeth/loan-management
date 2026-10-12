-- Khmer name is the main name for borrowers and users; the Latin spelling is optional.
-- borrowers.name_km (Khmer) is entered first; borrowers.name (Latin) may now be empty.
alter table public.borrowers alter column name set default '';
-- profiles.full_name holds the Khmer name; name_latin is the optional Latin spelling.
alter table public.profiles add column name_latin text not null default '';
