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
      const accommodation_request_id = req.query.accommodation_request_id;
      const start_date = req.query.start_date;
      const end_date = req.query.end_date;

      // Primero obtener los room_ids del accommodation si se proporciona accommodation_code
      let roomIds = null;
      if (accommodation_code) {
        const { data: rooms, error: roomsError } = await supabase
          .from('rooms')
          .select('id')
          .eq('accommodation_code', accommodation_code)
          .eq('user_id', user.id);
        
        if (roomsError) throw roomsError;
        if (rooms && rooms.length > 0) {
          roomIds = rooms.map(r => r.id);
        } else {
          // Si no hay habitaciones, retornar array vacío
          return res.status(200).json({ room_assignments: [] });
        }
      }

      let query = supabase
        .from('room_assignments')
        .select(`
          *,
          rooms(accommodation_code, room_name, room_type),
          accommodation_requests(id, check_in, check_out, num_guests, contract_reference, establishment_code)
        `)
        .eq('user_id', user.id);

      // Filtrar por accommodation_request_id si se proporciona
      if (accommodation_request_id) {
        query = query.eq('accommodation_request_id', accommodation_request_id);
      }

      // Filtrar por room_ids si se proporciona accommodation_code
      if (roomIds && roomIds.length > 0) {
        query = query.in('room_id', roomIds);
      }

      // Filtrar por rango de fechas si se proporciona
      // El día de check_out NO cuenta como ocupado (la habitación está libre para nuevo check-in)
      // Por eso usamos > en lugar de >= para check_out_date
      if (start_date && end_date) {
        // Asignaciones que se solapan con el rango: check_in < end_date AND check_out > start_date
        query = query
          .lt('check_in_date', end_date)
          .gt('check_out_date', start_date);
      } else if (start_date) {
        // check_out debe ser MAYOR que start_date (no igual, porque ese día está libre)
        query = query.gt('check_out_date', start_date);
      } else if (end_date) {
        query = query.lt('check_in_date', end_date);
      }

      let { data, error } = await query.order('check_in_date', { ascending: true });
      
      if (error) throw error;
      
      return res.status(200).json({ room_assignments: data || [] });
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
        .from('room_assignments')
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
    if (!data.check_in_date || !data.check_out_date) {
      return res.status(400).json({ error: 'Missing required fields: check_in_date, check_out_date' });
    }

    if (new Date(data.check_out_date) < new Date(data.check_in_date)) {
      return res.status(400).json({ error: 'check_out_date must be greater than or equal to check_in_date' });
    }

    try {
      // Verificar que la asignación pertenece al usuario
      const { data: existingAssignment, error: checkError } = await supabase
        .from('room_assignments')
        .select('room_id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      
      if (checkError || !existingAssignment) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Verificar disponibilidad de la habitación (excluyendo la asignación actual)
      const { data: availabilityCheck, error: availError } = await supabase
        .rpc('check_room_availability', {
          p_room_id: existingAssignment.room_id,
          p_check_in_date: data.check_in_date,
          p_check_out_date: data.check_out_date,
          p_exclude_assignment_id: id
        });

      if (availError) {
        // Si la función no existe, hacer verificación manual
        // Usamos < y > estrictos para permitir que el día de check-out sea el check-in de otra reserva
        // Solapamiento REAL ocurre cuando: existing.check_in < new.check_out AND existing.check_out > new.check_in
        // Ejemplo permitido: Reserva A (1-5) y Reserva B (5-10) NO se solapan porque 5 > 5 es FALSE
        const { data: overlapping, error: overlapError } = await supabase
          .from('room_assignments')
          .select('id, check_in_date, check_out_date')
          .eq('room_id', existingAssignment.room_id)
          .neq('id', id);

        if (overlapError) throw overlapError;
        
        // Filtrar manualmente para verificar solapamiento real (excluyendo el día de checkout)
        const hasOverlap = (overlapping || []).some(existing => {
          const existingCheckIn = new Date(existing.check_in_date);
          const existingCheckOut = new Date(existing.check_out_date);
          const newCheckIn = new Date(data.check_in_date);
          const newCheckOut = new Date(data.check_out_date);
          
          // Solapamiento: existing.check_in < new.check_out AND existing.check_out > new.check_in
          // El día de check-out NO cuenta como ocupado (se puede hacer check-in ese día)
          return existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
        });

        if (hasOverlap) {
          return res.status(409).json({ error: 'Room is already assigned for this date range' });
        }
      } else if (!availabilityCheck) {
        return res.status(409).json({ error: 'Room is already assigned for this date range' });
      }

      const updateFields = {
        check_in_date: data.check_in_date,
        check_out_date: data.check_out_date,
      };

      const { data: updated, error } = await supabase
        .from('room_assignments')
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
    if (!data || !data.room_id || !data.accommodation_request_id || !data.check_in_date || !data.check_out_date) {
      return res.status(400).json({ error: 'Missing required fields: room_id, accommodation_request_id, check_in_date, check_out_date' });
    }

    if (new Date(data.check_out_date) < new Date(data.check_in_date)) {
      return res.status(400).json({ error: 'check_out_date must be greater than or equal to check_in_date' });
    }

    // Verificar que la habitación y la reserva pertenecen al usuario
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, accommodation_code')
      .eq('id', data.room_id)
      .eq('user_id', user.id)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const { data: request, error: requestError } = await supabase
      .from('accommodation_requests')
      .select('id, check_in, check_out, establishment_code')
      .eq('id', data.accommodation_request_id)
      .eq('user_id', user.id)
      .single();

    if (requestError || !request) {
      return res.status(404).json({ error: 'Accommodation request not found' });
    }

    // Verificar que el accommodation_code coincide
    if (room.accommodation_code !== request.establishment_code) {
      return res.status(400).json({ error: 'Room and accommodation request must belong to the same accommodation' });
    }

    // Verificar que las fechas de asignación están dentro del rango de la reserva
    // Normalizar fechas para comparación (solo fecha, sin hora)
    const requestCheckIn = new Date(request.check_in);
    requestCheckIn.setHours(0, 0, 0, 0);
    const requestCheckOut = new Date(request.check_out);
    requestCheckOut.setHours(23, 59, 59, 999);
    
    const assignmentCheckIn = new Date(data.check_in_date);
    assignmentCheckIn.setHours(0, 0, 0, 0);
    const assignmentCheckOut = new Date(data.check_out_date);
    assignmentCheckOut.setHours(23, 59, 59, 999);

    // Las fechas de asignación deben estar dentro o iguales al rango de la reserva
    if (assignmentCheckIn < requestCheckIn || assignmentCheckOut > requestCheckOut) {
      return res.status(400).json({ error: 'Assignment dates must be within the reservation date range' });
    }

    // Verificar disponibilidad de la habitación
    const { data: availabilityCheck, error: availError } = await supabase
      .rpc('check_room_availability', {
        p_room_id: data.room_id,
        p_check_in_date: data.check_in_date,
        p_check_out_date: data.check_out_date,
        p_exclude_assignment_id: null
      });

    if (availError) {
      // Si la función no existe, hacer verificación manual
      // Usamos < y > estrictos para permitir que el día de check-out sea el check-in de otra reserva
      // Solapamiento REAL ocurre cuando: existing.check_in < new.check_out AND existing.check_out > new.check_in
      // Ejemplo permitido: Reserva A (1-5) y Reserva B (5-10) NO se solapan porque 5 > 5 es FALSE
      const { data: overlapping, error: overlapError } = await supabase
        .from('room_assignments')
        .select('id, check_in_date, check_out_date')
        .eq('room_id', data.room_id);

      if (overlapError) throw overlapError;
      
      // Filtrar manualmente para verificar solapamiento real (excluyendo el día de checkout)
      const hasOverlap = (overlapping || []).some(existing => {
        const existingCheckIn = new Date(existing.check_in_date);
        const existingCheckOut = new Date(existing.check_out_date);
        const newCheckIn = new Date(data.check_in_date);
        const newCheckOut = new Date(data.check_out_date);
        
        // Solapamiento: existing.check_in < new.check_out AND existing.check_out > new.check_in
        // El día de check-out NO cuenta como ocupado (se puede hacer check-in ese día)
        return existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
      });

      if (hasOverlap) {
        return res.status(409).json({ error: 'Room is already assigned for this date range' });
      }
    } else if (!availabilityCheck) {
      return res.status(409).json({ error: 'Room is already assigned for this date range' });
    }

    const insertRow = {
      room_id: data.room_id,
      accommodation_request_id: data.accommodation_request_id,
      check_in_date: data.check_in_date,
      check_out_date: data.check_out_date,
      user_id: user.id,
    };

    try {
      const { data: inserted, error } = await supabase
        .from('room_assignments')
        .insert(insertRow)
        .select(`
          *,
          rooms(accommodation_code, room_name, room_type),
          accommodation_requests(id, check_in, check_out, num_guests, contract_reference, establishment_code)
        `)
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


