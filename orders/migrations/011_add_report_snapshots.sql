ALTER TABLE orders ADD COLUMN seller_user_id TEXT;
ALTER TABLE orders ADD COLUMN ticket_description TEXT;

DROP TRIGGER IF EXISTS orders_immutable;
CREATE TRIGGER orders_immutable BEFORE UPDATE ON orders
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.ticket_id IS NOT OLD.ticket_id
 OR NEW.amount_cents IS NOT OLD.amount_cents OR NEW.currency IS NOT OLD.currency OR NEW.expires_at IS NOT OLD.expires_at
 OR NEW.seller_user_id IS NOT OLD.seller_user_id OR NEW.ticket_event_name IS NOT OLD.ticket_event_name
 OR NEW.ticket_description IS NOT OLD.ticket_description OR NEW.ticket_event_starts_at IS NOT OLD.ticket_event_starts_at
 OR NEW.ticket_event_ends_at IS NOT OLD.ticket_event_ends_at OR NEW.ticket_place IS NOT OLD.ticket_place
 OR NEW.ticket_info IS NOT OLD.ticket_info OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'immutable order fields'); END;
