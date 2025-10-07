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
      let query = supabase
        .from('accommodation_requests')
        .select('*');

      // Si se proporciona accommodation_code, filtrar por establishment_code
      if (req.query.accommodation_code) {
        const accommodationCodes = req.query.accommodation_code.split(',');
        if (accommodationCodes.length === 1) {
          query = query.eq('establishment_code', accommodationCodes[0]);
        } else {
          query = query.in('establishment_code', accommodationCodes);
        }
      }

      const { data, error } = await query
        .order('check_in', { descending: true })
        .limit(1000);
      
      if (error) throw error;
      return res.status(200).json({ accommodation_requests: data });
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
        .from('accommodation_requests')
        .delete()
        .eq('id', id)
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

    // Validar y filtrar solo los campos permitidos
    const allowedFields = [
      'establishment_code',
      'num_rooms', 
      'num_guests',
      'check_in',
      'check_out',
      'email',
      'contract_reference',
      'payment_type'
    ];

    const filteredData = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        filteredData[field] = data[field];
      }
    });

    // Validaciones básicas
    if (filteredData.num_rooms !== undefined && (isNaN(filteredData.num_rooms) || filteredData.num_rooms < 0)) {
      return res.status(400).json({ error: 'num_rooms must be a positive number' });
    }
    if (filteredData.num_guests !== undefined && (isNaN(filteredData.num_guests) || filteredData.num_guests < 0)) {
      return res.status(400).json({ error: 'num_guests must be a positive number' });
    }
    if (filteredData.email !== undefined && filteredData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(filteredData.email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
      const { data: updated, error } = await supabase
        .from('accommodation_requests')
        .update(filteredData)
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(200).json({ success: true, updated: updated[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const data = req.body;

    // Validar campos requeridos
    const requiredFields = [
      'establishment_code',
      'check_in',
      'check_out',
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    // Validaciones básicas
    if (isNaN(data.num_rooms) || data.num_rooms < 0) {
      return res.status(400).json({ error: 'num_rooms must be a positive number' });
    }
    if (isNaN(data.num_guests) || data.num_guests < 0) {
      return res.status(400).json({ error: 'num_guests must be a positive number' });
    }
    if (data.email != null && data.email != '' &&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Filtrar solo los campos permitidos
    const allowedFields = [
      'establishment_code',
      'num_rooms', 
      'num_guests',
      'check_in',
      'check_out',
      'contract_reference',
      'payment_type'
    ];

    const filteredData = {};
    allowedFields.forEach(field => {
      filteredData[field] = data[field];
    });

    try {
      const { data: created, error } = await supabase
        .from('accommodation_requests')
        .insert([filteredData])
        .select();
      if (error) throw error;
      return res.status(201).json({ success: true, accommodation_request: created[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
} 