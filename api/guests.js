import { getSupabaseClient } from './utils/supabaseClient.js';

// Función para capitalizar la primera letra de cada palabra
function capitalizeWords(str) {
    if (!str) return str;
    return str.toLowerCase().split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Función para convertir email a minúsculas
function normalizeEmail(email) {
    return email ? email.toLowerCase() : email;
}

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, DELETE, PUT, POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const data = req.body;
    if (!data) {
      return res.status(400).json({ error: 'Missing request body' });
    }
    
    // Validate required fields
    if (!data.request_id) {
      return res.status(400).json({ error: 'Missing required field: request_id' });
    }
    
    try {
      // Prepare guest data with user_id from authentication
      const guestData = {
        request_id: data.request_id,
        role: data.role || null,
        first_name: capitalizeWords(data.first_name),
        last_name1: capitalizeWords(data.last_name1),
        last_name2: capitalizeWords(data.last_name2),
        document_type: data.document_type || null,
        document_number: data.document_number || null,
        document_support: data.document_support || null,
        birth_date: data.birth_date || null,
        address: data.address || null,
        city_code: data.city_code || null,
        city_name: data.city_name || null,
        postal_code: data.postal_code || null,
        country: data.country || null,
        phone: data.phone || null,
        email: normalizeEmail(data.email),
        user_id: user.id, // Get user_id from authenticated user
        main_guest: data.main_guest || false
      };
      
      const { data: newGuest, error } = await supabase
        .from('guests')
        .insert(guestData)
        .select();
      if (error) throw error;

      // Si es el huésped principal, actualizar la cuenta de gastos con el guest_id
      if (data.main_guest === true) {
        const { error: expenseAccountError } = await supabase
          .from('expense_accounts')
          .update({ guest_id: newGuest[0].id })
          .eq('accommodation_request_id', data.request_id);

        if (expenseAccountError) {
          console.error('Error updating expense account with guest_id:', expenseAccountError);
          // No fallar la operación principal
        }
      }

      return res.status(201).json({ success: true, guest: newGuest[0] });
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
    const { id: _, ...updateFields } = data;
    
    // Apply formatting to name and email fields if they exist
    if (updateFields.first_name !== undefined) {
      updateFields.first_name = capitalizeWords(updateFields.first_name);
    }
    if (updateFields.last_name1 !== undefined) {
      updateFields.last_name1 = capitalizeWords(updateFields.last_name1);
    }
    if (updateFields.last_name2 !== undefined) {
      updateFields.last_name2 = capitalizeWords(updateFields.last_name2);
    }
    if (updateFields.email !== undefined) {
      updateFields.email = normalizeEmail(updateFields.email);
    }
    
    try {
      const { data: updated, error } = await supabase
        .from('guests')
        .update(updateFields)
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Si se actualiza a huésped principal, actualizar la cuenta de gastos
      if (updateFields.main_guest === true) {
        const { error: expenseAccountError } = await supabase
          .from('expense_accounts')
          .update({ guest_id: id })
          .eq('accommodation_request_id', updated[0].request_id);

        if (expenseAccountError) {
          console.error('Error updating expense account with guest_id:', expenseAccountError);
          // No fallar la operación principal
        }
      }

      return res.status(200).json({ success: true, updated: updated[0] });
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
        .from('guests')
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

  if (req.method === 'GET') {
    try {
      const { acr_id } = req.query;
      
      let query = supabase
        .from('guests')
        .select('*, accommodation_requests!inner(short_id, check_in, check_out)')
        .order('created_at', { ascending: false });
      
      // If acr_id is provided, filter by request_id
      if (acr_id) {
        query = query.eq('request_id', acr_id);
      } else {
        query = query.limit(1000);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      console.log(data);
      return res.status(200).json({ guests: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method not allowed')
}
  