import { supabase } from './supabaseClient.js';

/**
 * Obtener todos los expertos
 */
export async function getAllExperts(req, res) {
  try {
    const { data, error } = await supabase
      .from('experts')
      .select('*')
      .order('display_order');

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getAllExperts:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener experto por ID
 */
export async function getExpertById(req, res) {
  const id = req.params.id;
  try {
    const { data, error } = await supabase
      .from('experts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Experto no encontrado' });

    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en getExpertById:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Crear nuevo experto
 */
 export async function createExpert(req, res) {
   const { id_experto, experto, source, display_order } = req.body;
   if (!experto || !source) {
     return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
   }

   try {
     const { data, error } = await supabase
       .from('experts')
       .insert({ id_experto, experto, source, display_order })
       .select()
       .maybeSingle();

     if (error) throw error;

     res.status(201).json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en createExpert:', err.message || err);
     res.status(500).json({ success: false, error: err.message });
   }
 }

 export async function updateExpert(req, res) {
   const id = req.params.id;
   const { id_experto, experto, source, display_order } = req.body;

   try {
     const { data, error } = await supabase
       .from('experts')
       .update({ id_experto, experto, source, display_order })
       .eq('id', id)
       .select()
       .maybeSingle();

     if (error) throw error;
     if (!data) return res.status(404).json({ success: false, error: 'Experto no encontrado' });

     res.json({ success: true, data });
   } catch (err) {
     console.error('❌ Error en updateExpert:', err.message || err);
     res.status(500).json({ success: false, error: err.message });
   }
 }

/**
 * Eliminar experto
 */
export async function deleteExpert(req, res) {
  const id = req.params.id;
  try {
    const { error } = await supabase
      .from('experts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Experto eliminado' });
  } catch (err) {
    console.error('❌ Error en deleteExpert:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtiene la fuente (source) de un experto usando su ID.
 * @param {number|string} idExpert - ID numérico (FantasyPros) o string (Flock)
 * @returns {Promise<string|null>} - 'fantasypros', 'flock' o null si no se encuentra
 */
export async function getExpertData(idExpert) {
  if (!idExpert) {
    console.warn('⚠️ idExpert no proporcionado o inválido');
    return null;
  }
  //const queryField = typeof idExpert === 'string' ? 'experto' : 'id_experto';
  //console.log(queryField);
  const { data, error } = await supabase
    .from('experts')
    .select('id, id_experto, experto, source')
    .eq('id', idExpert)
    .maybeSingle();

  if (error) {
    console.error('❌ Error obteniendo source del experto:', error.message);
    return null;
  }

  return data;
}

export async function getTopExpertsFromDB(limit = 3) {
  // Ajusta nombres de columnas si tu tabla difiere
  const { data, error } = await supabase
    .from('experts')
    .select('id_experto, experto, source, active, display_order')
    .eq('active', true)
    .order('display_order', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Error consultando tabla experts: ${error.message}`);
  return data || [];
}
