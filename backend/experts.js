import { supabase } from './supabaseClient.js';

/**
 * Obtener todos los expertos
 */
export async function getAllExperts(req, res) {
  try {
    const { data, error } = await supabase
      .from('experts')
      .select('*')
      .order('id');

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
  const id = parseInt(req.params.id);
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
  const { id_experto, experto } = req.body;
  if (!id_experto || !experto) {
    return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
  }

  try {
    const { data, error } = await supabase
      .from('experts')
      .insert({ id_experto, experto })
      .select()
      .maybeSingle();

    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('❌ Error en createExpert:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Actualizar experto
 */
export async function updateExpert(req, res) {
  const id = parseInt(req.params.id);
  const { id_experto, experto } = req.body;

  try {
    const { data, error } = await supabase
      .from('experts')
      .update({ id_experto, experto })
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
  const id = parseInt(req.params.id);
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
