import { supabase } from '../services/claudeService.js';

const DEFAULT_SETTINGS = {
  min_ai_score: 75,
  weighted_skills: '',
  email_new_application: true,
  email_screening_complete: true,
  full_name: '',
  offer_email_subject: 'Congratulations — {{job_title}} Offer',
  offer_email_template: [
    'Dear {{candidate_name}},',
    '',
    'Congratulations! We are pleased to inform you that you have been selected for the {{job_title}} position at our company.',
    '',
    '{{hr_notes}}',
    '',
    'Your expected start date: {{start_date}}',
    '',
    'We look forward to welcoming you to the team!',
    '',
    'Best regards,',
    '{{sender_name}}',
  ].join('\n'),
};

// PostgREST/Postgres codes raised when the `settings` table has not been
// created yet (see supabase/migration.sql).
const TABLE_MISSING_CODES = ['PGRST205', '42P01', 'PGRST204'];

function tableMissing(error) {
  return Boolean(error && TABLE_MISSING_CODES.includes(error.code));
}

function mapRow(row) {
  return {
    user_id: row?.user_id ?? null,
    min_ai_score: Number(row?.min_ai_score ?? DEFAULT_SETTINGS.min_ai_score),
    weighted_skills: typeof row?.weighted_skills === 'string' ? row.weighted_skills : '',
    email_new_application: row ? Boolean(row.email_new_application) : true,
    email_screening_complete: row ? Boolean(row.email_screening_complete) : true,
    full_name: typeof row?.full_name === 'string' ? row.full_name : '',
    offer_email_subject:
      typeof row?.offer_email_subject === 'string' && row.offer_email_subject.trim()
        ? row.offer_email_subject
        : DEFAULT_SETTINGS.offer_email_subject,
    offer_email_template:
      typeof row?.offer_email_template === 'string' && row.offer_email_template.trim()
        ? row.offer_email_template
        : DEFAULT_SETTINGS.offer_email_template,
    updated_at: row?.updated_at ?? null,
  };
}

/**
 * Fetch the settings row for a user id, returning the defaults when no row
 * exists or the table is missing. Never throws.
 */
export async function getSettingsForUser(userId) {
  if (!userId) return { ...DEFAULT_SETTINGS };

  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (tableMissing(error)) {
        console.warn('[settings] settings table not available yet (run migration.sql):', error.message);
        return { ...DEFAULT_SETTINGS };
      }
      console.warn('[settings] Failed to load settings:', error.message);
      return { ...DEFAULT_SETTINGS };
    }

    if (!data) return { ...DEFAULT_SETTINGS };
    return mapRow(data);
  } catch (error) {
    console.warn('[settings] Failed to load settings:', error.message);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * GET /api/settings
 * Returns the current user's settings, creating a default row the first time.
 */
export const getSettings = async (req, res, next) => {
  try {
    const { id: userId } = req.user;

    let row = null;
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      row = data;
    } catch (error) {
      if (!tableMissing(error)) return next(error);
      // Table not created yet — fall back to defaults below.
      console.warn('[settings] settings table not available yet (run migration.sql).');
      row = null;
    }

    if (!row) {
      const { data: created, error: insertError } = await supabase
        .from('settings')
        .insert({ user_id: userId })
        .select()
        .maybeSingle();
      if (insertError && !tableMissing(insertError)) {
        return next(insertError);
      }
      row = created ?? null;
    }

    res.json(mapRow(row));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/settings
 * Upserts the current user's settings with the submitted values.
 */
export const updateSettings = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const body = req.body || {};

    const fields = {
      min_ai_score: Number.isFinite(Number(body.min_ai_score))
        ? Math.max(0, Math.min(100, Math.round(Number(body.min_ai_score))))
        : DEFAULT_SETTINGS.min_ai_score,
      weighted_skills: typeof body.weighted_skills === 'string' ? body.weighted_skills.trim() : '',
      email_new_application: body.email_new_application !== undefined ? Boolean(body.email_new_application) : true,
      email_screening_complete: body.email_screening_complete !== undefined ? Boolean(body.email_screening_complete) : true,
      full_name: typeof body.full_name === 'string' ? body.full_name.trim() : '',
      offer_email_subject:
        typeof body.offer_email_subject === 'string' && body.offer_email_subject.trim()
          ? body.offer_email_subject.trim()
          : DEFAULT_SETTINGS.offer_email_subject,
      offer_email_template:
        typeof body.offer_email_template === 'string' && body.offer_email_template.trim()
          ? body.offer_email_template
          : DEFAULT_SETTINGS.offer_email_template,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('settings')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('settings').update(fields).eq('user_id', userId)
      : await supabase.from('settings').insert({ user_id: userId, ...fields });

    if (error && !tableMissing(error)) {
      return next(error);
    }

    res.json({ success: true, settings: mapRow({ user_id: userId, ...fields }) });
  } catch (error) {
    next(error);
  }
};
