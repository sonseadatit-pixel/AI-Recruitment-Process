import { supabase } from '../services/claudeService.js';

const TABLE_MISSING_CODES = ['PGRST205', '42P01', 'PGRST204'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tableMissing(error) {
  return Boolean(error && TABLE_MISSING_CODES.includes(error.code));
}

/**
 * GET /api/notifications
 * Returns unread notifications for the notification bell, newest first.
 */
export const getNotifications = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) {
      // notifications table not created yet (see supabase/migration.sql)
      if (tableMissing(error)) return res.json([]);
      return next(error);
    }

    res.json(data || []);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/notifications/:id/read
 * Marks a notification as read.
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Notification not found' });

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (tableMissing(error)) return res.status(404).json({ error: 'Notification not found' });
      return next(error);
    }
    if (!data) return res.status(404).json({ error: 'Notification not found' });

    res.json(data);
  } catch (error) {
    next(error);
  }
};
