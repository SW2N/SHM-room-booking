-- Mock users and ~2 weeks of mock bookings so people can try the app.
-- Remove all mock data later with:
--   delete from auth.users where email like 'mock.%@sahamitproduct.com';   (after deleting their bookings/series/bans/handovers)
-- Mock users have no password and cannot sign in.
do $$
declare
  names text[] := array['Nok (NF1)', 'Ploy (PCB)', 'Beam (NPD)', 'Fon (SCM)', 'Toon (MKT)', 'Pim (ACC)'];
  mails text[] := array['nok', 'ploy', 'beam', 'fon', 'toon', 'pim'];
  ids uuid[] := '{}';
  titles text[] := array['Weekly team meeting', 'CJ performance review', 'Supplier call', 'NPD tracking',
                         'Budget review', 'Product training', 'Projection meeting', 'Interview'];
  rooms text[] := array['AC2-1', 'AC2-2', 'AC6-1', 'AC6-2', 'KT5-1', 'KT5-2', 'KT5-3', 'KT6-1', 'KT6-2'];
  slots time[] := array['09:00', '10:30', '13:00', '14:30', '16:00'];
  lens interval[] := array['1 hour', '1 hour 30 minutes', '2 hours'];
  d date := (now() at time zone 'Asia/Bangkok')::date + 1;
  days int := 0; i int; k int := 0; v uuid; s timestamptz;
  next_tue date; next_mon date; next_wed date;
begin
  for i in 1 .. 6 loop
    v := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mock.' || mails[i] || '@sahamitproduct.com',
            jsonb_build_object('display_name', 'Mock ' || names[i], 'department', split_part(split_part(names[i], '(', 2), ')', 1)),
            now(), now());
    ids := ids || v;
  end loop;

  -- three weekly series, like the regular meetings in the Excel sheet
  next_tue := d; while extract(isodow from next_tue) <> 2 loop next_tue := next_tue + 1; end loop;
  next_mon := d; while extract(isodow from next_mon) <> 1 loop next_mon := next_mon + 1; end loop;
  next_wed := d; while extract(isodow from next_wed) <> 3 loop next_wed := next_wed + 1; end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true);
  perform create_series('KT5-3', 'MM Meeting', next_tue, '09:30', '12:00', jsonb_build_object('freq', 'weekly', 'weekdays', '[2]'::jsonb, 'until', d + 13));
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true);
  perform create_series('KT5-3', 'Sale Meeting PCB', next_mon, '13:30', '17:00', jsonb_build_object('freq', 'weekly', 'weekdays', '[1]'::jsonb, 'until', d + 13));
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true);
  perform create_series('KT5-1', 'NF team meeting & NPD update', next_wed, '09:30', '12:00', jsonb_build_object('freq', 'weekly', 'weekdays', '[3]'::jsonb, 'until', d + 13));
  perform set_config('request.jwt.claims', '', true);

  -- single bookings across all rooms for the next 10 working days
  while days < 10 loop
    if extract(isodow from d) < 6 and not exists (select 1 from holidays where day = d) then
      days := days + 1;
      for i in 1 .. array_length(rooms, 1) loop
        k := k + 1;
        if ((i + days) % 3) <> 0 then   -- vary which rooms are busy each day
          s := (d + slots[1 + (k % 5)]) at time zone 'Asia/Bangkok';
          begin
            insert into bookings (room_code, owner_id, title, starts_at, ends_at, created_by)
            values (rooms[i], ids[1 + (k % 6)], titles[1 + (k % 8)], s, s + lens[1 + (k % 3)], ids[1 + (k % 6)]);
          exception when others then null;   -- clashes with a series: skip
          end;
        end if;
      end loop;
    end if;
    d := d + 1;
  end loop;
end $$;
