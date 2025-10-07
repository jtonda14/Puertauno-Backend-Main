import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, DELETE, PUT, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('accommodations')
        .select('accommodation_code, rooms, guests, name, calendar_url, auto_sync, last_sync_timestamp')
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw error;
      return res.status(200).json({ accommodation_requests: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    const accommodation_code = req.query.accommodation_code;
    if (!accommodation_code) {
      return res.status(400).json({ error: 'Missing accommodation_code parameter' });
    }
    try {
      const { error, count } = await supabase
        .from('accommodations')
        .delete()
        .eq('accommodation_code', accommodation_code)
        .select('accommodation_code', { count: 'exact' });
      if (error) throw error;
      if (count === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const data = req.body;
    const accommodation_code = data && data.accommodation_code;
    if (!accommodation_code) {
      return res.status(400).json({ error: 'Missing accommodation_code in body' });
    }
    // Preparar los campos a actualizar
    const updateFields = {
      accommodation_code: data.accommodation_code,
      rooms: data.rooms,
      guests: data.guests,
      name: data.name,
      auto_sync: data.auto_sync,
      calendar_url: data.calendar_url,
    };
    
    try {
      const { data: updated, error } = await supabase
        .from('accommodations')
        .update(updateFields)
        .eq('accommodation_code', accommodation_code)
        .select();
      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(200).json(updated[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const data = req.body;
    if (!data || !data.accommodation_code || !data.name) {
      return res.status(400).json({ error: 'Missing required fields: accommodation_code, name' });
    }

    const insertRow = {
      accommodation_code: data.accommodation_code,
      user_id: user.id,
      rooms: data.rooms ?? null,
      guests: data.guests ?? null,
      name: data.name,
      auto_sync: data.auto_sync,
      calendar_url: data.calendar_url ?? null,
    };
    try {
      const { data: inserted, error } = await supabase
        .from('accommodations')
        .insert(insertRow)
        .select('accommodation_code, rooms, guests, name, calendar_url, auto_sync')
        .single();
      if (error) throw error;
      return res.status(201).json(inserted);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
} 