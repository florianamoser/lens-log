import type { Lens } from './types';

const created = '2026-01-01T00:00:00.000Z';

const stops = {
  f2_22: ['2', '2.8', '4', '5.6', '8', '11', '16', '22'],
  f22_32: ['2.2', '2.8', '4', '5.6', '8', '11', '16', '22', '32'],
  f28_22: ['2.8', '4', '5.6', '8', '11', '16', '22'],
  f28_32: ['2.8', '4', '5.6', '8', '11', '16', '22', '32'],
  f28_45: ['2.8', '4', '5.6', '8', '11', '16', '22', '32', '45'],
  f32_45: ['3.2', '4', '5.6', '8', '11', '16', '22', '32', '45'],
  f35_22: ['3.5', '4', '5.6', '8', '11', '16', '22'],
  f35_32: ['3.5', '4', '5.6', '8', '11', '16', '22', '32'],
  f4_22: ['4', '5.6', '8', '11', '16', '22'],
  f4_32: ['4', '5.6', '8', '11', '16', '22', '32'],
  f4_45: ['4', '5.6', '8', '11', '16', '22', '32', '45'],
  f45_22: ['4.5', '5.6', '8', '11', '16', '22'],
  f45_32: ['4.5', '5.6', '8', '11', '16', '22', '32'],
  f45_45: ['4.5', '5.6', '8', '11', '16', '22', '32', '45'],
  f48_32: ['4.8', '5.6', '8', '11', '16', '22', '32'],
  f56_22: ['5.6', '8', '11', '16', '22'],
  f56_32: ['5.6', '8', '11', '16', '22', '32'],
  f56_45: ['5.6', '8', '11', '16', '22', '32', '45'],
  f65_32: ['6.5', '8', '11', '16', '22', '32'],
  f68_45: ['6.8', '8', '11', '16', '22', '32', '45'],
} as const;

function builtIn(id: string, short: string, name: string, apertures: readonly string[], active = false): Lens {
  return { id, short, name, apertures: [...apertures], active, builtIn: true, updatedAt: created };
}

export const DEFAULT_LENSES: Lens[] = [
  // Canon TS-E
  builtIn('canon-tse-17', '17', 'Canon TS-E 17mm f/4L', stops.f4_22, true),
  builtIn('canon-tse-24-i', '24', 'Canon TS-E 24mm f/3.5L', stops.f35_22),
  builtIn('canon-tse-24-ii', '24', 'Canon TS-E 24mm f/3.5L II', stops.f35_22, true),
  builtIn('canon-tse-45', '45', 'Canon TS-E 45mm f/2.8', stops.f28_22),
  builtIn('canon-tse-50-macro', '50', 'Canon TS-E 50mm f/2.8L Macro', stops.f28_32),
  builtIn('canon-tse-90', '90', 'Canon TS-E 90mm f/2.8', stops.f28_32),
  builtIn('canon-tse-90-macro', '90', 'Canon TS-E 90mm f/2.8L Macro', stops.f28_45),
  builtIn('canon-tse-135-macro', '135', 'Canon TS-E 135mm f/4L Macro', stops.f4_45),

  // Fujifilm GFX tilt/shift
  builtIn('fuji-gf-30-ts', '30', 'Fujinon GF30mmF5.6 T/S', stops.f56_32),
  builtIn('fuji-gf-110-ts-macro', '110', 'Fujinon GF110mmF5.6 T/S Macro', stops.f56_32),

  // Hasselblad H system
  builtIn('hasselblad-hcd-24', '24', 'Hasselblad HCD 4.8/24', stops.f48_32),
  builtIn('hasselblad-hcd-28', '28', 'Hasselblad HCD 4/28', stops.f4_32),
  builtIn('hasselblad-hc-35', '35', 'Hasselblad HC 3.5/35', stops.f35_32),
  builtIn('hasselblad-hc-50', '50', 'Hasselblad HC 3.5/50', stops.f35_32),
  builtIn('hasselblad-hc-50-ii', '50', 'Hasselblad HC 3.5/50 II', stops.f35_32),
  builtIn('hasselblad-hc-80', '80', 'Hasselblad HC 2.8/80', stops.f28_32),
  builtIn('hasselblad-hc-100', '100', 'Hasselblad HC 2.2/100', stops.f22_32),
  builtIn('hasselblad-hc-macro-120', '120', 'Hasselblad HC Macro 4/120', stops.f4_45),
  builtIn('hasselblad-hc-macro-120-ii', '120', 'Hasselblad HC Macro 4/120 II', stops.f4_45),
  builtIn('hasselblad-hc-150', '150', 'Hasselblad HC 3.2/150', stops.f32_45),
  builtIn('hasselblad-hc-210', '210', 'Hasselblad HC 4/210', stops.f4_45),
  builtIn('hasselblad-hc-300', '300', 'Hasselblad HC 4.5/300', stops.f45_45),
  builtIn('hasselblad-hcd-35-90', '35–90', 'Hasselblad HCD 4–5.6/35–90', stops.f4_32),
  builtIn('hasselblad-hc-50-110', '50–110', 'Hasselblad HC 3.5–4.5/50–110', stops.f35_32),

  // Carl Zeiss Contax 645
  builtIn('c645-35', '35', 'Contax 645 · Carl Zeiss Distagon T* 3.5/35', stops.f35_32, true),
  builtIn('c645-45', '45', 'Contax 645 · Carl Zeiss Distagon T* 2.8/45', stops.f28_32, true),
  builtIn('c645-45-90', '45–90', 'Contax 645 · Carl Zeiss Vario-Sonnar T* 4.5/45–90', stops.f45_32),
  builtIn('c645-55', '55', 'Contax 645 · Carl Zeiss Distagon T* 3.5/55', stops.f35_32, true),
  builtIn('c645-80', '80', 'Contax 645 · Carl Zeiss Planar T* 2/80', stops.f2_22),
  builtIn('c645-120', '120', 'Contax 645 · Carl Zeiss Apo-Makro-Planar T* 4/120', stops.f4_32),
  builtIn('c645-140', '140', 'Contax 645 · Carl Zeiss Sonnar T* 2.8/140', stops.f28_32),
  builtIn('c645-210', '210', 'Contax 645 · Carl Zeiss Sonnar T* 4/210', stops.f4_45),
  builtIn('c645-350', '350', 'Contax 645 · Carl Zeiss Tele-Apotessar T* 4/350', stops.f4_32),

  // Schneider-Kreuznach / Phase One 645 Silver Ring
  builtIn('sk-po-silver-28', '28', 'Schneider-Kreuznach 28mm LS f/4.5 Aspherical — Silver Ring', stops.f45_32),
  builtIn('sk-po-silver-45', '45', 'Schneider-Kreuznach 45mm LS f/3.5 — Silver Ring', stops.f35_32),
  builtIn('sk-po-silver-55', '55', 'Schneider-Kreuznach 55mm LS f/2.8 — Silver Ring', stops.f28_32),
  builtIn('sk-po-silver-80', '80', 'Schneider-Kreuznach 80mm LS f/2.8 — Silver Ring', stops.f28_22),
  builtIn('sk-po-silver-110', '110', 'Schneider-Kreuznach 110mm LS f/2.8 — Silver Ring', stops.f28_22),
  builtIn('sk-po-silver-120', '120', 'Schneider-Kreuznach 120mm LS f/4 Macro — Silver Ring', stops.f4_22),
  builtIn('sk-po-silver-150-35', '150', 'Schneider-Kreuznach 150mm LS f/3.5 — Silver Ring', stops.f35_32),
  builtIn('sk-po-silver-150-28', '150', 'Schneider-Kreuznach 150mm LS f/2.8 IF — Silver Ring', stops.f28_22),
  builtIn('sk-po-silver-240', '240', 'Schneider-Kreuznach 240mm LS f/4.5 IF — Silver Ring', stops.f45_22),
  builtIn('sk-po-silver-40-80', '40–80', 'Schneider-Kreuznach 40–80mm LS f/4–5.6 — Silver Ring', stops.f4_45),
  builtIn('sk-po-silver-75-150', '75–150', 'Schneider-Kreuznach 75–150mm LS f/4–5.6 — Silver Ring', stops.f4_45),

  // Schneider-Kreuznach / Phase One 645 Blue Ring
  builtIn('sk-po-blue-35', '35', 'Schneider-Kreuznach 35mm LS f/3.5 — Blue Ring', stops.f35_32),
  builtIn('sk-po-blue-45', '45', 'Schneider-Kreuznach 45mm LS f/3.5 — Blue Ring', stops.f35_32),
  builtIn('sk-po-blue-55', '55', 'Schneider-Kreuznach 55mm LS f/2.8 — Blue Ring', stops.f28_32),
  builtIn('sk-po-blue-80', '80', 'Schneider-Kreuznach 80mm LS f/2.8 Mark II — Blue Ring', stops.f28_22),
  builtIn('sk-po-blue-110', '110', 'Schneider-Kreuznach 110mm LS f/2.8 — Blue Ring', stops.f28_22),
  builtIn('sk-po-blue-120', '120', 'Schneider-Kreuznach 120mm LS f/4 Macro — Blue Ring', stops.f4_22),
  builtIn('sk-po-blue-150', '150', 'Schneider-Kreuznach 150mm LS f/2.8 IF — Blue Ring', stops.f28_22),
  builtIn('sk-po-blue-240', '240', 'Schneider-Kreuznach 240mm LS f/4.5 IF — Blue Ring', stops.f45_22),
  builtIn('sk-po-blue-40-80', '40–80', 'Schneider-Kreuznach 40–80mm LS f/4–5.6 — Blue Ring', stops.f4_45),
  builtIn('sk-po-blue-75-150', '75–150', 'Schneider-Kreuznach 75–150mm LS f/4–5.6 — Blue Ring', stops.f4_45),
  builtIn('sk-po-120-ts', '120', 'Schneider-Kreuznach 120mm MF TS f/5.6', stops.f56_22),

  // Mamiya 645 Digital / D lenses supported by Phase One XF
  builtIn('mamiya-d-28', '28', 'Mamiya Digital AF 28mm f/4.5 D', stops.f45_32),
  builtIn('mamiya-d-35', '35', 'Mamiya Digital AF 35mm f/3.5 D', stops.f35_32),
  builtIn('mamiya-d-45', '45', 'Mamiya Digital AF 45mm f/2.8 D', stops.f28_32),
  builtIn('mamiya-d-55', '55', 'Mamiya Digital AF 55mm f/2.8 D', stops.f28_22),
  builtIn('mamiya-d-55-ls', '55', 'Mamiya Digital AF 55mm f/2.8 D LS', stops.f28_22),
  builtIn('mamiya-d-80', '80', 'Mamiya Digital AF 80mm f/2.8 D', stops.f28_22),
  builtIn('mamiya-d-80-ls', '80', 'Mamiya Digital AF 80mm f/2.8 D LS', stops.f28_22),
  builtIn('mamiya-d-110-ls', '110', 'Mamiya Digital AF 110mm f/2.8 D LS', stops.f28_22),
  builtIn('mamiya-d-120-macro', '120', 'Mamiya Digital MF 120mm f/4 Macro D', stops.f4_32),
  builtIn('mamiya-d-75-150', '75–150', 'Mamiya Digital AF 75–150mm f/4.5 D', stops.f45_32),

  // Phase One Digital focal-plane lenses for the Mamiya 645 mount
  builtIn('phase-one-digital-28', '28', 'Phase One Digital AF 28mm f/4.5', stops.f45_32),
  builtIn('phase-one-digital-35', '35', 'Phase One Digital AF 35mm f/3.5', stops.f35_32),
  builtIn('phase-one-digital-45', '45', 'Phase One Digital AF 45mm f/2.8', stops.f28_32),
  builtIn('phase-one-digital-80', '80', 'Phase One Digital AF 80mm f/2.8', stops.f28_22),
  builtIn('phase-one-digital-120-mf', '120', 'Phase One Digital MF 120mm f/4 Macro', stops.f4_32),
  builtIn('phase-one-digital-120-af', '120', 'Phase One Digital AF 120mm f/4 Macro', stops.f4_32),
  builtIn('phase-one-digital-150', '150', 'Phase One Digital AF 150mm f/2.8 IF', stops.f28_22),
  builtIn('phase-one-digital-75-150', '75–150', 'Phase One Digital AF 75–150mm f/4.5', stops.f45_32),

  // Schneider-Kreuznach Apo-Componon HM enlarging lenses
  builtIn('schneider-apo-componon-40', '40', 'Schneider-Kreuznach Apo-Componon HM 2.8/40', stops.f28_22),
  builtIn('schneider-apo-componon-45', '45', 'Schneider-Kreuznach Apo-Componon HM 4/45', stops.f4_32),
  builtIn('schneider-apo-componon-60', '60', 'Schneider-Kreuznach Apo-Componon HM 4/60', stops.f4_32),
  builtIn('schneider-apo-componon-80', '80', 'Schneider-Kreuznach Apo-Componon HM 4/80', stops.f4_32),
  builtIn('schneider-apo-componon-90', '90', 'Schneider-Kreuznach Apo-Componon 4.5/90', stops.f45_22, true),
  builtIn('schneider-apo-componon-100', '100', 'Schneider-Kreuznach Apo-Componon HM 5.6/100', stops.f56_32),
  builtIn('schneider-apo-componon-120', '120', 'Schneider-Kreuznach Apo-Componon HM 5.6/120', stops.f56_32),
  builtIn('schneider-apo-componon-150', '150', 'Schneider-Kreuznach Apo-Componon HM 4/150', stops.f4_32),
  builtIn('schneider-apo-componon-180', '180', 'Schneider-Kreuznach Apo-Componon HM 5.6/180', stops.f56_45),
  builtIn('schneider-apo-componon-210', '210', 'Schneider-Kreuznach Apo-Componon HM 5.6/210', stops.f56_45),

  // Schneider digital technical-camera lenses referenced for Pico
  builtIn('schneider-apo-digitar-24-xl', '24', 'Schneider-Kreuznach Apo-Digitar 5.6/24 XL', stops.f56_22),
  builtIn('schneider-super-digitar-28-xl', '28', 'Schneider-Kreuznach Super-Digitar 2.8/28 XL', stops.f28_22),
  builtIn('schneider-apo-digitar-35-xl', '35', 'Schneider-Kreuznach Apo-Digitar 5.6/35 XL', stops.f56_32),
  builtIn('schneider-apo-digitar-43-xl', '43', 'Schneider-Kreuznach Apo-Digitar 5.6/43 XL', stops.f56_32),
  builtIn('schneider-digitar-47-xl', '47', 'Schneider-Kreuznach Digitar 5.6/47 XL', stops.f56_32),
  builtIn('schneider-apo-digitar-60-xl', '60', 'Schneider-Kreuznach Apo-Digitar 5.6/60 XL', stops.f56_32),
  builtIn('schneider-apo-digitar-60-n', '60', 'Schneider-Kreuznach Apo-Digitar 4/60 N', stops.f4_32),
  builtIn('schneider-apo-digitar-80-n', '80', 'Schneider-Kreuznach Apo-Digitar 4/80 N', stops.f4_32),
  builtIn('schneider-apo-digitar-90-n', '90', 'Schneider-Kreuznach Apo-Digitar 4.5/90 N', stops.f45_32),
  builtIn('schneider-apo-digitar-100-n', '100', 'Schneider-Kreuznach Apo-Digitar 5.6/100 N', stops.f56_32),
  builtIn('schneider-apo-digitar-100-asph', '100', 'Schneider-Kreuznach Apo-Digitar 5.6/100 Aspheric', stops.f56_32),
  builtIn('schneider-apo-digitar-120-n', '120', 'Schneider-Kreuznach Apo-Digitar 5.6/120 N', stops.f56_32),
  builtIn('schneider-apo-digitar-120-asph', '120', 'Schneider-Kreuznach Apo-Digitar 5.6/120 Aspheric', stops.f56_32),

  // Rodenstock lenses referenced in the Pico compatibility table
  builtIn('rodenstock-hr-digaron-s-23', '23', 'Rodenstock HR Digaron-S 5.6/23', stops.f56_22),
  builtIn('rodenstock-hr-digaron-s-28', '28', 'Rodenstock HR Digaron-S 4.5/28', stops.f45_32),
  builtIn('rodenstock-hr-digaron-w-32', '32', 'Rodenstock HR Digaron-W 4/32', stops.f4_32),
  builtIn('rodenstock-hr-digaron-s-35', '35', 'Rodenstock HR Digaron-S 4/35', stops.f4_32),
  builtIn('rodenstock-hr-digaron-w-40', '40', 'Rodenstock HR Digaron-W 4/40', stops.f4_32),
  builtIn('rodenstock-hr-digaron-w-50', '50', 'Rodenstock HR Digaron-W 4/50', stops.f4_32),
  builtIn('rodenstock-hr-digaron-s-60', '60', 'Rodenstock HR Digaron-S 4/60', stops.f4_32),
  builtIn('rodenstock-hr-digaron-w-70', '70', 'Rodenstock HR Digaron-W 5.6/70', stops.f56_32),
  builtIn('rodenstock-hr-digaron-sw-90', '90', 'Rodenstock HR Digaron-SW 5.6/90', stops.f56_32),
  builtIn('rodenstock-hr-digaron-s-100', '100', 'Rodenstock HR Digaron-S 4/100', stops.f4_32),
  builtIn('rodenstock-hr-digaron-macro-105', '105', 'Rodenstock HR Digaron Macro Float 5.6/105', stops.f56_32),
  builtIn('rodenstock-hr-digaron-sw-138', '138', 'Rodenstock HR Digaron-SW Float 6.5/138', stops.f65_32),
  builtIn('rodenstock-apo-sironar-digital-35', '35', 'Rodenstock Apo-Sironar Digital 4.5/35', stops.f45_32),
  builtIn('rodenstock-apo-sironar-digital-45', '45', 'Rodenstock Apo-Sironar Digital 4.5/45', stops.f45_32),
  builtIn('rodenstock-apo-sironar-digital-55', '55', 'Rodenstock Apo-Sironar Digital 4.5/55', stops.f45_32),
  builtIn('rodenstock-apo-sironar-digital-105', '105', 'Rodenstock Apo-Sironar Digital 5.6/105', stops.f56_32),
  builtIn('rodenstock-apo-sironar-digital-120', '120', 'Rodenstock Apo-Sironar Digital 5.6/120', stops.f56_32),
  builtIn('rodenstock-apo-sironar-digital-135', '135', 'Rodenstock Apo-Sironar Digital 5.6/135', stops.f56_32),

  // Current ALPA lens range (shutter and barrel variants share one optical entry)
  builtIn('alpa-hr-alpagon-23', '23', 'Rodenstock / ALPA HR Alpagon 5.6/23', stops.f56_32),
  builtIn('alpa-hr-alpagon-32', '32', 'Rodenstock / ALPA HR Alpagon 4/32', stops.f4_32),
  builtIn('alpa-hr-alpagon-40', '40', 'Rodenstock / ALPA HR Alpagon 4/40', stops.f4_32),
  builtIn('alpa-hr-alpagon-50', '50', 'Rodenstock / ALPA HR Alpagon 4/50', stops.f4_32),
  builtIn('alpa-hr-alpagon-70', '70', 'Rodenstock / ALPA HR Alpagon 5.6/70', stops.f56_32),
  builtIn('alpa-hr-alpagon-90', '90', 'Rodenstock / ALPA HR Alpagon 5.6/90', stops.f56_32),
  builtIn('alpa-hr-alpagon-138', '138', 'Rodenstock / ALPA HR Alpagon 6.5/138 Float', stops.f65_32),
  builtIn('alpa-hr-alpar-180', '180', 'Rodenstock / ALPA HR Alpar 5.6/180', stops.f56_32),

  // Former ALPA lens range
  builtIn('alpa-apo-digitar-24', '24', 'Schneider / ALPA Apo-Digitar 5.6/24', stops.f56_22),
  builtIn('alpa-apo-helvetar-28', '28', 'Schneider / ALPA Apo-Helvetar 5.6/28', stops.f56_22),
  builtIn('alpa-hr-alpar-28', '28', 'Rodenstock / ALPA HR Alpar 4.5/28', stops.f45_32),
  builtIn('alpa-apo-alpar-35', '35', 'Rodenstock / ALPA Apo-Alpar 4.5/35', stops.f45_32),
  builtIn('alpa-hr-alpar-35', '35', 'Rodenstock / ALPA HR Alpar 4/35', stops.f4_32),
  builtIn('alpa-apo-switar-36', '36', 'Schneider / ALPA Apo-Switar 5.6/36', stops.f56_32),
  builtIn('alpa-super-angulon-38-xl', '38', 'Schneider / ALPA Super-Angulon XL 5.6/38', stops.f56_32),
  builtIn('alpa-apo-helvetar-43', '43', 'Schneider / ALPA Apo-Helvetar 5.6/43', stops.f56_32),
  builtIn('alpa-apo-alpar-45', '45', 'Rodenstock / ALPA Apo-Alpar 4.5/45', stops.f45_32),
  builtIn('alpa-super-angulon-47-xl', '47', 'Schneider / ALPA Super-Angulon XL 5.6/47', stops.f56_32),
  builtIn('alpa-apo-helvetar-48', '48', 'Schneider / ALPA Apo-Helvetar 5.6/48', stops.f56_32),
  builtIn('alpa-apo-alpar-55', '55', 'Rodenstock / ALPA Apo-Alpar 4.5/55', stops.f45_32),
  builtIn('alpa-super-angulon-58-xl', '58', 'Schneider / ALPA Super-Angulon XL 5.6/58', stops.f56_32),
  builtIn('alpa-apo-digitar-60', '60', 'Schneider / ALPA Apo-Digitar 4/60', stops.f4_32),
  builtIn('alpa-apo-helvetar-60', '60', 'Schneider / ALPA Apo-Helvetar 5.6/60', stops.f56_32),
  builtIn('alpa-hr-digaron-60', '60', 'Rodenstock / ALPA HR Digaron 4/60', stops.f4_32),
  builtIn('alpa-apo-helvetar-75', '75', 'Schneider / ALPA Apo-Helvetar 5.6/75', stops.f56_32),
  builtIn('alpa-apo-digitar-80', '80', 'Schneider / ALPA Apo-Digitar 4/80', stops.f4_32),
  builtIn('alpa-super-symmar-80-xl', '80', 'Schneider / ALPA Super-Symmar XL 4.5/80', stops.f45_32),
  builtIn('alpa-apo-digitar-90', '90', 'Schneider / ALPA Apo-Digitar 4.5/90', stops.f45_32),
  builtIn('alpa-hr-digaron-100', '100', 'Rodenstock / ALPA HR Digaron 4/100', stops.f4_32),
  builtIn('alpa-apo-digitar-120', '120', 'Schneider / ALPA Apo-Digitar 5.6/120', stops.f56_32),
  builtIn('alpa-apo-helvetar-120', '120', 'Schneider / ALPA Apo-Helvetar 5.6/120', stops.f56_32),
  builtIn('alpa-apo-digitar-150', '150', 'Schneider / ALPA Apo-Digitar 5.6/150', stops.f56_45),
  builtIn('alpa-apo-digitar-180', '180', 'Schneider / ALPA Apo-Digitar 5.6/180', stops.f56_45),
  builtIn('alpa-apo-digitar-210', '210', 'Schneider / ALPA Apo-Digitar 6.8/210', stops.f68_45),
  builtIn('alpa-tele-arton-250', '250', 'Schneider / ALPA Tele-Arton 5.6/250', stops.f56_45),

  // ARCA-SWISS Pico lenses
  builtIn('arca-pico-24', '24', 'ARCA-SWISS 24mm f/3.5 Tilt/Swing', stops.f35_22),
  builtIn('arca-pico-50', '50', 'ARCA-SWISS 50mm f/2.8 Tilt/Swing', stops.f28_22),
];

export function nextFrame(frame: string) {
  return String((Number(frame || 0) + 1) % 10000).padStart(4, '0');
}

export function normalizeFrame(frame: string) {
  return String(Math.max(0, Math.min(9999, Number(frame || 0)))).padStart(4, '0');
}

export function formatShift(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}
