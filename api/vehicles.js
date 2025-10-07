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
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ vehicles: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }
    try {
      const { error, count } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id)
        .select('id', { count: 'exact' });
      if (error) throw error;
      if (count === 0) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const data = req.body;
    const id = data && data.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }
    // No actualizar el id
    const { id: _, ...updateFields } = data;
    try {
      const { data: updated, error } = await supabase
        .from('vehicles')
        .update(updateFields)
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
      return res.status(200).json({ success: true, updated: updated[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const data = req.body;
    if (!data.request_id || !data.license_plate) {
      return res.status(400).json({ error: 'Missing required fields: request_id and license_plate' });
    }
    try {
      const { data: newVehicle, error } = await supabase
        .from('vehicles')
        .insert({
          request_id: data.request_id,
          license_plate: data.license_plate,
          sent: data.sent || false,
          user_id: user.id
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ success: true, vehicle: newVehicle });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
} 