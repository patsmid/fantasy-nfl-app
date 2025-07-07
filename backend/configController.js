import { supabase } from './supabaseClient.js';

/**
 * Obtener todas las configuraciones
 */
 export async function getAllConfig(req, res) {
   try {
     const { data, error } = await supabase
       .from('config')
       .select('*')
       .order('key');

     if (error) throw error;

     // Formatear si existe playerDB_updated
     const formattedData = data.map((item) => {
       if (item.key === 'playerDB_updated' && item.value) {
         const date = new Date(item.value);
         const day = String(date.getDate()).padStart(2, '0');
         const month = String(date.getMonth() + 1).padStart(2, '0');
         const year = date.getFullYear();
         const hours = String(date.getHours()).padStart(2, '0');
         const minutes = String(date.getMinutes()).padStart(2, '0');
         const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
         return { ...item, value: formattedDate };
       }
       return item;
     });

     res.json({ success: true, data: formattedData });
   } catch (err) {
     console.error('❌ Error en getAllConfig:', err.message || err);
     res.status(500).json({ success: false, error: err.message });
   }
 }


/**
 * Obtener una configuración por clave
 */
export async function getConfig(req, res) {
  const { key } = req.params;

  try {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }

    res.json({ success: true, key, value: data.value });
  } catch (err) {
    console.error('❌ Error en getConfig:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Crear o actualizar una configuración
 */
 export async function setConfig(req, res) {
   const { key, value } = req.body;

   if (!key) {
     return res.status(400).json({ success: false, error: 'No se encontró el valor key' });
   }

   try {
     let finalValue = value;

     // Formatea si es playerDB_updated y el valor es una fecha válida
     if (key === 'playerDB_updated') {
       const date = new Date(value);
       if (!isNaN(date)) {
         const day = String(date.getDate()).padStart(2, '0');
         const month = String(date.getMonth() + 1).padStart(2, '0');
         const year = date.getFullYear();
         const hours = String(date.getHours()).padStart(2, '0');
         const minutes = String(date.getMinutes()).padStart(2, '0');
         finalValue = `${day}/${month}/${year} ${hours}:${minutes}`;
       }
     }

     const { error } = await supabase
       .from('config')
       .upsert(
         {
           key,
           value: finalValue,
           updated_at: new Date().toISOString()
         },
         { onConflict: 'key' }
       );

     if (error) throw error;

     res.json({ success: true, message: `Configuración actualizada: ${key}` });
   } catch (err) {
     console.error('❌ Error en setConfig:', err.message || err);
     res.status(500).json({ success: false, error: err.message });
   }
 }
