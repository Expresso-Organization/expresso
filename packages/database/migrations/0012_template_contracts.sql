alter table template
  add column description text not null default '',
  add column renderer_version integer not null default 1 check (renderer_version > 0),
  add column style jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object'),
  add column industries text[] not null default '{}',
  add column is_active boolean not null default true;

alter table company
  add column tone_palette jsonb check (
    tone_palette is null or jsonb_typeof(tone_palette) = 'object'
  );

insert into template (
  code, name, description, tone_tags, supported_sections,
  plan_required, renderer_version, style, industries
) values
  (
    'clarity', 'Clarity', 'Readable single-column evidence narrative',
    array['clear', 'professional'], array['*'], 'free', 1,
    '{"background":"#ffffff","text":"#1f2937","accent":"#2563eb","font":"sans","density":"comfortable"}'::jsonb,
    array['software', 'technology']
  ),
  (
    'signal', 'Signal', 'Compact evidence-forward technical layout',
    array['technical', 'concise'], array['*'], 'free', 1,
    '{"background":"#0f172a","text":"#e2e8f0","accent":"#38bdf8","font":"sans","density":"compact"}'::jsonb,
    array['software', 'data', 'infrastructure']
  ),
  (
    'editorial', 'Editorial', 'Spacious narrative layout for detailed work',
    array['warm', 'narrative'], array['*'], 'pro', 1,
    '{"background":"#fffaf0","text":"#3f2d20","accent":"#9a3412","font":"serif","density":"spacious"}'::jsonb,
    array['design', 'research', 'writing']
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  tone_tags = excluded.tone_tags,
  supported_sections = excluded.supported_sections,
  plan_required = excluded.plan_required,
  renderer_version = excluded.renderer_version,
  style = excluded.style,
  industries = excluded.industries,
  is_active = true;
