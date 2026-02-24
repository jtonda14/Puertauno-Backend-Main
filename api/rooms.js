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
      const accommodation_code = req.query.accommodation_code;
      
      let query = supabase
        .from('rooms')
        .select('*')
        .eq('user_id', user.id);

      // Si se proporciona accommodation_code, filtrar por él
      if (accommodation_code) {
        query = query.eq('accommodation_code', accommodation_code);
      }

      const { data, error } = await query.order('room_name', { ascending: true });
      
      if (error) throw error;
      return res.status(200).json({ rooms: data || [] });
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
        .from('rooms')
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

  if (req.method === 'PUT') {
    const data = req.body;
    const id = data && data.id;
    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }

    // Validar campos requeridos
    if (!data.room_name) {
      return res.status(400).json({ error: 'Missing required field: room_name' });
    }

    // Preparar los campos a actualizar
    const updateFields = {
      room_name: data.room_name,
      room_type: data.room_type || null,
      capacity: data.capacity || null,
      floor: data.floor !== undefined && data.floor !== null && data.floor !== '' ? Number(data.floor) : null,
      price: data.price !== undefined && data.price !== null && data.price !== '' ? Number(data.price) : null,
    };
    
    try {
      // Verificar que la habitación pertenece al usuario
      const { data: existingRoom, error: checkError } = await supabase
        .from('rooms')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      
      if (checkError || !existingRoom) {
        return res.status(404).json({ error: 'Not found' });
      }

      const { data: updated, error } = await supabase
        .from('rooms')
        .update(updateFields)
        .eq('id', id)
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
    if (!data || !data.accommodation_code || !data.room_name) {
      return res.status(400).json({ error: 'Missing required fields: accommodation_code, room_name' });
    }

    // Verificar que el accommodation existe y pertenece al usuario
    const { data: accommodation, error: accError } = await supabase
      .from('accommodations')
      .select('accommodation_code')
      .eq('accommodation_code', data.accommodation_code)
      .eq('user_id', user.id)
      .single();

    if (accError || !accommodation) {
      return res.status(404).json({ error: 'Accommodation not found' });
    }

    const insertRow = {
      accommodation_code: data.accommodation_code,
      room_name: data.room_name,
      room_type: data.room_type || null,
      capacity: data.capacity || null,
      floor: data.floor !== undefined && data.floor !== null && data.floor !== '' ? Number(data.floor) : null,
      price: data.price !== undefined && data.price !== null && data.price !== '' ? Number(data.price) : null,
      user_id: user.id,
    };

    try {
      const { data: inserted, error } = await supabase
        .from('rooms')
        .insert(insertRow)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(inserted);
    } catch (err) {
      console.error(err);
      // Verificar si es error de duplicado
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Room with this name already exists for this accommodation' });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}


