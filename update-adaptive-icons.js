// update-adaptive-icons.js
// Coloca este archivo en la raíz de tu proyecto

const fs = require('fs').promises;
const path = require('path');

async function updateAdaptiveIcons() {
  console.log('🎨 Actualizando Adaptive Icons...');

  const basePath = 'android/app/src/main/res';
  const iconPath = 'resources/icon.png';

  // Verificar que existe el icono base
  try {
    await fs.access(iconPath);
    console.log('✅ Icon base encontrado:', iconPath);
  } catch {
    console.error('❌ No se encontró resources/icon.png');
    return;
  }

  // Definir tamaños para cada densidad
  const densities = [
    { folder: 'mipmap-mdpi', size: 48 },
    { folder: 'mipmap-hdpi', size: 72 },
    { folder: 'mipmap-xhdpi', size: 96 },
    { folder: 'mipmap-xxhdpi', size: 144 },
    { folder: 'mipmap-xxxhdpi', size: 192 },
  ];

  for (const density of densities) {
    const folderPath = path.join(basePath, density.folder);

    try {
      // Verificar que la carpeta existe
      await fs.access(folderPath);

      // Copiar ic_launcher.png como ic_launcher_foreground.png
      const sourcePath = path.join(folderPath, 'ic_launcher.png');
      const foregroundPath = path.join(folderPath, 'ic_launcher_foreground.png');

      // Verificar que ic_launcher.png existe
      await fs.access(sourcePath);

      // Copiar el archivo
      await fs.copyFile(sourcePath, foregroundPath);
      console.log(`✅ ${density.folder}/ic_launcher_foreground.png actualizado`);

      // Crear background blanco sólido usando imagemagick o sharp si está disponible
      // Por ahora, solo copiamos el mismo icono como background
      const backgroundPath = path.join(folderPath, 'ic_launcher_background.png');
      await fs.copyFile(sourcePath, backgroundPath);
      console.log(`✅ ${density.folder}/ic_launcher_background.png actualizado`);
    } catch (error) {
      console.log(`⚠️  ${density.folder}: ${error.message}`);
    }
  }

  // Crear el XML para adaptive icon si no existe
  await createAdaptiveIconXML();

  console.log('\n🎉 Adaptive Icons actualizados completamente!');
  console.log('📱 Ejecuta: npm run sync && npx cap open android');
}

async function createAdaptiveIconXML() {
  const xmlDir = 'android/app/src/main/res/mipmap-anydpi-v26';

  try {
    // Crear directorio si no existe
    await fs.mkdir(xmlDir, { recursive: true });

    // XML para ic_launcher
    const icLauncherXML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>`;

    // XML para ic_launcher_round
    const icLauncherRoundXML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>`;

    await fs.writeFile(path.join(xmlDir, 'ic_launcher.xml'), icLauncherXML);
    await fs.writeFile(path.join(xmlDir, 'ic_launcher_round.xml'), icLauncherRoundXML);

    console.log('✅ XML adaptive icons creados');
  } catch (error) {
    console.log('⚠️  Error creando XML:', error.message);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  updateAdaptiveIcons().catch(console.error);
}

module.exports = updateAdaptiveIcons;
