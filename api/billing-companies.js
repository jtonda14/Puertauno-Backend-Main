import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  // GET - Get all billing companies or a specific one
  if (req.method === 'GET') {
    try {
      const { id, search } = req.query;

      if (id) {
        const { data, error } = await supabase
          .from('billing_companies')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Company not found' });
          }
          throw error;
        }
        return res.status(200).json({ company: data });
      }

      let query = supabase
        .from('billing_companies')
        .select('*')
        .order('company_name', { ascending: true });

      if (search) {
        query = query.or(`company_name.ilike.%${search}%,tax_id.ilike.%${search}%`);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return res.status(200).json({ companies: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - Create new billing company
  if (req.method === 'POST') {
    const data = req.body;
    
    if (!data.company_name) {
      return res.status(400).json({ error: 'Missing required field: company_name' });
    }

    try {
      const companyData = {
        company_name: data.company_name,
        tax_id: data.tax_id || null,
        address: data.address || null,
        city: data.city || null,
        postal_code: data.postal_code || null,
        country: data.country || null,
        email: data.email || null,
        phone: data.phone || null,
        user_id: user.id
      };

      const { data: created, error } = await supabase
        .from('billing_companies')
        .insert([companyData])
        .select();

      if (error) throw error;
      return res.status(201).json({ success: true, company: created[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT - Update billing company
  if (req.method === 'PUT') {
    const data = req.body;
    const id = data && data.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }

    const allowedFields = ['company_name', 'tax_id', 'address', 'city', 'postal_code', 'country', 'email', 'phone'];
    const updateData = {};
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    try {
      const { data: updated, error } = await supabase
        .from('billing_companies')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }

      return res.status(200).json({ success: true, company: updated[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE - Delete billing company
  if (req.method === 'DELETE') {
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    try {
      const { error, count } = await supabase
        .from('billing_companies')
        .delete()
        .eq('id', id)
        .select('id', { count: 'exact' });

      if (error) throw error;
      if (count === 0) {
        return res.status(404).json({ error: 'Company not found' });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}


