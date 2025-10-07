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
        .rpc('get_links_with_requests');
      if (error) throw error;
      return res.status(200).json({ links: data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const linkData = req.body;
      
      // Validar campos obligatorios
      if (!linkData.url || linkData.url.trim() === '') {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Preparar los datos para la inserción
      const newLink = {
        url: linkData.url,
        email: linkData.email || null,
        exp_date: linkData.exp_date || null,
        one_use: linkData.one_use || false,
        used: linkData.used || false,
        accommodation_code: linkData.accommodation_code || null,
        accommodation_request_id: linkData.accommodation_request_id || null,
        user_id: user.id, // Usar el ID del usuario autenticado
        emails_sent: 0 // Inicializar en 0
      };

      const { data: createdLink, error } = await supabase
        .from('links')
        .insert(newLink)
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ 
        success: true, 
        link: createdLink,
        message: 'Link created successfully' 
      });
    } catch (err) {
      console.error('Error creating link:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const linkData = req.body;
      const id = req.query.id;
      
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      // Preparar los campos para actualización
      const updateFields = {
        url: linkData.url,
        email: linkData.email || null,
        exp_date: linkData.exp_date || null,
        one_use: linkData.one_use || false,
        used: linkData.used || false,
        accommodation_code: linkData.accommodation_code || null,
        accommodation_request_id: linkData.accommodation_request_id || null,
      };

      // Remver campos undefined
      Object.keys(updateFields).forEach(key => {
        if (updateFields[key] === undefined) {
          delete updateFields[key];
        }
      });

      const { data: updatedLink, error } = await supabase
        .from('links')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ 
        success: true, 
        updated: updatedLink,
        message: 'Link updated successfully' 
      });
    } catch (err) {
      console.error('Error updating link:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const id = req.query.id;
      
      if (!id) {
        return res.status(400).json({ error: 'Missing id parameter' });
      }

      // Verificar que el enlace existe y pertenece al usuario
      const { data: existingLink, error: fetchError } = await supabase
        .from('links')
        .select('id, user_id')
        .eq('id', id)
        .single();

      if (fetchError || !existingLink) {
        return res.status(404).json({ error: 'Link not found' });
      }

      if (existingLink.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden: Link does not belong to user' });
      }

      const { error } = await supabase
        .from('links')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ 
        success: true,
        message: 'Link deleted successfully' 
      });
    } catch (err) {
      console.error('Error deleting link:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
} 