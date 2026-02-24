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

  // GET - Get all expense categories
  if (req.method === 'GET') {
    try {
      const { active_only } = req.query;
      
      let query = supabase
        .from('expense_categories')
        .select('*')
        .order('name', { ascending: true });

      if (active_only === 'true') {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return res.status(200).json({ categories: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - Create new expense category
  if (req.method === 'POST') {
    const data = req.body;
    
    if (!data.name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    try {
      const categoryData = {
        name: data.name,
        description: data.description || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
        user_id: user.id
      };

      const { data: created, error } = await supabase
        .from('expense_categories')
        .insert([categoryData])
        .select();

      if (error) throw error;
      return res.status(201).json({ success: true, category: created[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT - Update expense category
  if (req.method === 'PUT') {
    const data = req.body;
    const id = data && data.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id in body' });
    }

    const allowedFields = ['name', 'description', 'is_active'];
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
        .from('expense_categories')
        .update(updateData)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      return res.status(200).json({ success: true, category: updated[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE - Delete expense category
  if (req.method === 'DELETE') {
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    try {
      const { error, count } = await supabase
        .from('expense_categories')
        .delete()
        .eq('id', id)
        .select('id', { count: 'exact' });

      if (error) throw error;
      if (count === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}


