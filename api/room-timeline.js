import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
      const start_date = req.query.start_date || new Date().toISOString().split('T')[0];
      const days = parseInt(req.query.days) || 7;
      const min_capacity = req.query.min_capacity ? parseInt(req.query.min_capacity) : null;
      const availability = req.query.availability; // 'occupied', 'free', o undefined

      if (!accommodation_code) {
        return res.status(400).json({ error: 'Missing accommodation_code parameter' });
      }

      // Calcular fecha de fin
      const startDate = new Date(start_date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days - 1);
      const end_date = endDate.toISOString().split('T')[0];

      // Obtener todas las habitaciones del accommodation
      let roomsQuery = supabase
        .from('rooms')
        .select('id, room_name, room_type, capacity')
        .eq('accommodation_code', accommodation_code)
        .eq('user_id', user.id);

      // Filtrar por capacidad mínima si se especifica
      if (min_capacity) {
        roomsQuery = roomsQuery.gte('capacity', min_capacity);
      }

      const { data: rooms, error: roomsError } = await roomsQuery
        .order('capacity', { ascending: true, nullsFirst: false });

      if (roomsError) throw roomsError;

      // Obtener todas las asignaciones en el rango de fechas
      // Primero obtener los IDs de las habitaciones del accommodation
      const roomIds = (rooms || []).map(room => room.id);
      
      if (roomIds.length === 0) {
        // Si no hay habitaciones, retornar estructura vacía
        return res.status(200).json({
          start_date,
          end_date,
          days,
          rooms: [],
          assignments_by_date: {}
        });
      }

      // Obtener las asignaciones para estas habitaciones
      const { data: assignments, error: assignmentsError } = await supabase
        .from('room_assignments')
        .select(`
          id,
          room_id,
          check_in_date,
          check_out_date,
          rooms(accommodation_code, room_name, room_type),
          accommodation_requests(
            id,
            check_in,
            check_out,
            num_guests,
            num_rooms,
            contract_reference,
            establishment_code,
            status
          )
        `)
        .in('room_id', roomIds)
        .eq('user_id', user.id)
        .or(`check_in_date.lte.${end_date},check_out_date.gte.${start_date}`)
        .order('check_in_date', { ascending: true });

      if (assignmentsError) throw assignmentsError;

      // Procesar las relaciones que vienen como objetos anidados
      // Supabase puede devolver las relaciones como objetos únicos o arrays
      const processedAssignments = (assignments || []).map(assignment => {
        // Normalizar la estructura: Supabase puede devolver rooms como objeto o array
        const roomData = Array.isArray(assignment.rooms) ? assignment.rooms[0] : assignment.rooms;
        const requestData = Array.isArray(assignment.accommodation_requests) 
          ? assignment.accommodation_requests[0] 
          : assignment.accommodation_requests;
        
        return {
          ...assignment,
          rooms: roomData,
          accommodation_requests: requestData
        };
      }).filter(assignment => {
        // Asegurar que las relaciones existen
        return assignment.rooms && assignment.accommodation_requests;
      });

      // Estructurar datos por día y habitación
      const timeline = {
        start_date,
        end_date,
        days,
        rooms: [],
        assignments_by_date: {}
      };

      // Inicializar estructura de días
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        timeline.assignments_by_date[dateStr] = {};
      }

      // Procesar cada habitación
      (rooms || []).forEach(room => {
        // Filtrar asignaciones para esta habitación
        const roomAssignments = processedAssignments.filter(
          assignment => assignment.room_id === room.id
        );

        // Aplicar filtro de disponibilidad
        const hasAssignments = roomAssignments.length > 0;
        if (availability === 'occupied' && !hasAssignments) {
          return; // Saltar habitaciones sin reservas si se pide solo ocupadas
        }
        if (availability === 'free' && hasAssignments) {
          return; // Saltar habitaciones con reservas si se pide solo libres
        }

        const roomData = {
          id: room.id,
          room_name: room.room_name,
          room_type: room.room_type,
          capacity: room.capacity,
          assignments: []
        };

        roomAssignments.forEach(assignment => {
          const assignmentData = {
            id: assignment.id,
            check_in_date: assignment.check_in_date,
            check_out_date: assignment.check_out_date,
            accommodation_request: assignment.accommodation_requests,
            room: assignment.rooms
          };

          roomData.assignments.push(assignmentData);

          // Agregar a assignments_by_date para cada día que cubre
          const assignCheckIn = new Date(assignment.check_in_date);
          const assignCheckOut = new Date(assignment.check_out_date);

          for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const currentDate = new Date(dateStr);

            // Verificar si la asignación cubre este día
            if (currentDate >= assignCheckIn && currentDate <= assignCheckOut) {
              if (!timeline.assignments_by_date[dateStr][room.id]) {
                timeline.assignments_by_date[dateStr][room.id] = [];
              }
              timeline.assignments_by_date[dateStr][room.id].push(assignmentData);
            }
          }
        });

        timeline.rooms.push(roomData);
      });

      return res.status(200).json(timeline);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).send('Method Not Allowed');
}


