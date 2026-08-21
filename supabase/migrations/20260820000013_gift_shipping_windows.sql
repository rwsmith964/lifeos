-- LifeOS: shipping-window config for order-by date math (Section 7.4).
-- "Seed these as a config table, not hardcoded" — lib/gifts/leadtime.ts reads
-- this table rather than embedding the day counts in application code.

alter table households
  add column gift_handling_buffer_days integer not null default 2,
  add column gift_personal_buffer_days integer not null default 2;

create table gift_shipping_windows (
  category text primary key,
  label text not null,
  shipping_window_days integer not null,
  description text not null default ''
);

alter table gift_shipping_windows enable row level security;

create policy "any authenticated user can read shipping windows"
  on gift_shipping_windows for select
  using (auth.uid() is not null);

-- Global reference config: no insert/update/delete policy for regular users
-- (default deny). Maintained via migration or service role.

insert into gift_shipping_windows (category, label, shipping_window_days, description) values
  ('standard', 'Standard retail goods', 5, 'Typical in-stock retail item with standard shipping.'),
  ('apparel', 'Apparel / sized items', 10, 'Return/exchange risk for size means extra buffer.'),
  ('custom', 'Custom / engraved / personalized', 14, 'Made-to-order production time before it even ships.'),
  ('handmade', 'Handmade / small-batch / Etsy-type', 12, 'Small-batch makers ship on their own production schedule.'),
  ('furniture', 'Furniture / oversized', 21, 'Freight shipping, longer transit windows.'),
  ('digital', 'Digital / gift card', 0, 'Delivered instantly, no shipping window.'),
  ('experience', 'Experience / tickets', 0, 'No shipping window, but see order_by date math notes for lead time on the experience itself.');
