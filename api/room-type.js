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
        .from('room_type')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ room_types: data || [] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !body.name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const insertRow = {
      name: body.name,
      description: body.description || null,
      user_id: user.id,
    };

    try {
      const { data, error } = await supabase
        .from('room_type')
        .insert(insertRow)
        .select()
        .single();

      if (error) {
        // Unique violation on (user_id, name)
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Room type with this name already exists' });
        }
        throw error;
      }

      return res.status(201).json(data);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const body = req.body;
    const id = body && body.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }
    if (!body.name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    try {
      // Ensure the room_type belongs to the user
      const { data: existingType, error: checkError } = await supabase
        .from('room_type')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (checkError || !existingType) {
        return res.status(404).json({ error: 'Not found' });
      }

      const updateFields = {
        name: body.name,
        description: body.description || null,
      };

      const { data: updated, error } = await supabase
        .from('room_type')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Room type with this name already exists' });
        }
        throw error;
      }

      return res.status(200).json(updated);
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
        .from('room_type')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id', { count: 'exact' });

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

  return res.status(405).send('Method Not Allowed');
}

