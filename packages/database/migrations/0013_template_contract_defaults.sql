update template
set supported_sections = array['*']
where not (supported_sections @> array['*']);

update template
set style = '{"background":"#ffffff","text":"#1f2937","accent":"#2563eb","font":"sans","density":"comfortable"}'::jsonb
where not (
  style ? 'background'
  and style ? 'text'
  and style ? 'accent'
  and style ? 'font'
  and style ? 'density'
);

alter table template
  alter column supported_sections set default array['*'],
  alter column style set default '{"background":"#ffffff","text":"#1f2937","accent":"#2563eb","font":"sans","density":"comfortable"}'::jsonb;
