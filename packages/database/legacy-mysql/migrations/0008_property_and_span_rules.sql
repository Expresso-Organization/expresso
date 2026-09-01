-- PostgreSQL 이 PL/pgSQL 로 들고 있던 규칙 셋을 MySQL 로 옮긴다. 0003 에 함께
-- 넣지 못한 것은 셋 다 JSON 을 하나씩 훑어야 해서 복합문 본문이 필요하기
-- 때문이다.

-- 요건의 근거 구간은 공고 원문에서 그 자리를 그대로 잘라낸 것이어야 한다.
create trigger posting_requirement_span_exact_insert before insert on job_posting_requirement for each row
begin
  declare source_text longtext;
  declare span_start int;
  declare span_end int;
  declare span_quote longtext;

  select description_raw into source_text from job_posting where id = new.job_posting_id;
  if source_text is null then
    signal sqlstate '45000' set message_text = 'requirement source is unavailable';
  end if;
  set span_start = cast(new.source_span ->> '$.start' as signed);
  set span_end = cast(new.source_span ->> '$.end' as signed);
  set span_quote = new.source_span ->> '$.quote';
  if span_start is null or span_end is null or span_quote is null
    or span_start < 0
    or span_end <= span_start
    or span_end - span_start <> char_length(span_quote)
    or substring(source_text, span_start + 1, span_end - span_start) <> span_quote
  then
    signal sqlstate '45000' set message_text = 'requirement source span does not match immutable posting source';
  end if;
end;

create trigger posting_requirement_span_exact_update before update on job_posting_requirement for each row
begin
  declare source_text longtext;
  declare span_start int;
  declare span_end int;
  declare span_quote longtext;

  select description_raw into source_text from job_posting where id = new.job_posting_id;
  if source_text is null then
    signal sqlstate '45000' set message_text = 'requirement source is unavailable';
  end if;
  set span_start = cast(new.source_span ->> '$.start' as signed);
  set span_end = cast(new.source_span ->> '$.end' as signed);
  set span_quote = new.source_span ->> '$.quote';
  if span_start is null or span_end is null or span_quote is null
    or span_start < 0
    or span_end <= span_start
    or span_end - span_start <> char_length(span_quote)
    or substring(source_text, span_start + 1, span_end - span_start) <> span_quote
  then
    signal sqlstate '45000' set message_text = 'requirement source span does not match immutable posting source';
  end if;
end;

-- 속성 정의를 지울 때, 그 속성에 값을 넣어 둔 기록이 남아 있으면 막는다.
create trigger category_property_removal_guard_update before update on category for each row
begin
  declare index_at int default 0;
  declare key_count int default json_length(json_keys(old.property_schema));
  declare property_key varchar(255);
  declare message varchar(255);

  -- 이름을 바꾸거나 순서를 옮기는 것도 같은 트리거를 지난다. 정의가 그대로면
  -- 기록을 뒤지지 않는다.
  if new.property_schema <> old.property_schema then
    while index_at < key_count do
      set property_key = json_unquote(json_extract(json_keys(old.property_schema), concat('$[', index_at, ']')));
      if json_contains(json_keys(new.property_schema), json_quote(property_key)) = 0
         and exists (select 1 from record
                     where category_id = old.id and deleted_at is null
                       and json_contains(json_keys(properties), json_quote(property_key)))
      then
        set message = concat('property ', property_key, ' still has record values');
        signal sqlstate '45000' set message_text = message;
      end if;
      set index_at = index_at + 1;
    end while;
  end if;
end;

-- 기록의 속성은 소속 분류가 정의한 것만, 정의한 타입으로만 들어간다.
create procedure validate_record_properties(in category_id_in char(36), in properties_in json)
begin
  declare schema_value json;
  declare index_at int default 0;
  declare key_count int;
  declare property_key varchar(255);
  declare property_value json;
  declare definition json;
  declare expected_type varchar(32);
  declare item_at int;
  declare message varchar(255);

  select property_schema into schema_value from category where id = category_id_in;
  if schema_value is null then
    signal sqlstate '45000' set message_text = 'record category does not exist';
  end if;

  set key_count = json_length(json_keys(properties_in));
  while index_at < key_count do
    set property_key = json_unquote(json_extract(json_keys(properties_in), concat('$[', index_at, ']')));
    if json_contains(json_keys(schema_value), json_quote(property_key)) = 0 then
      set message = concat('property ', property_key, ' is not defined by the category');
      signal sqlstate '45000' set message_text = message;
    end if;
    set definition = json_extract(schema_value, concat('$.', json_quote(property_key)));
    set property_value = json_extract(properties_in, concat('$.', json_quote(property_key)));
    set expected_type = json_unquote(json_extract(definition, '$.type'));
    set message = concat('property ', property_key, ' does not match type ', coalesce(expected_type, 'unknown'));
    if expected_type in ('text', 'date') and json_type(property_value) <> 'STRING' then
      signal sqlstate '45000' set message_text = message;
    elseif expected_type = 'number' and json_type(property_value) not in ('INTEGER', 'DOUBLE', 'DECIMAL') then
      signal sqlstate '45000' set message_text = message;
    elseif expected_type = 'boolean' and json_type(property_value) <> 'BOOLEAN' then
      signal sqlstate '45000' set message_text = message;
    elseif expected_type = 'tags' then
      if json_type(property_value) <> 'ARRAY' then
        signal sqlstate '45000' set message_text = message;
      end if;
      set item_at = 0;
      while item_at < json_length(property_value) do
        if json_type(json_extract(property_value, concat('$[', item_at, ']'))) <> 'STRING' then
          signal sqlstate '45000' set message_text = message;
        end if;
        set item_at = item_at + 1;
      end while;
    end if;
    set index_at = index_at + 1;
  end while;

  set index_at = 0;
  set key_count = json_length(json_keys(schema_value));
  while index_at < key_count do
    set property_key = json_unquote(json_extract(json_keys(schema_value), concat('$[', index_at, ']')));
    if json_extract(schema_value, concat('$.', json_quote(property_key), '.required')) = cast('true' as json)
       and (json_contains(json_keys(properties_in), json_quote(property_key)) = 0
            or json_type(json_extract(properties_in, concat('$.', json_quote(property_key)))) = 'NULL')
    then
      set message = concat('required property ', property_key, ' is missing');
      signal sqlstate '45000' set message_text = message;
    end if;
    set index_at = index_at + 1;
  end while;
end;

create trigger record_properties_match_category_insert before insert on record for each row
  call validate_record_properties(new.category_id, new.properties);

create trigger record_properties_match_category_update before update on record for each row
  if new.category_id <> old.category_id or new.properties <> old.properties
  then call validate_record_properties(new.category_id, new.properties);
  end if;
