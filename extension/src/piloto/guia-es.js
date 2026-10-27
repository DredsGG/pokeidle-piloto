// Textos de la guía de primer uso y de las novedades (regla 12 del hub) — ESPAÑOL.
// En cada versión nueva: agrega la entrada en `novidades` en los tres archivos (pt, en, es), en
// frases cortas, pensadas para quien usa. Solo la versión actual aparece en el cuadro.
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  (PIH.guiaTextos = PIH.guiaTextos || {}).es = {
    ui: {
      comoUsar: 'Cómo usar el Piloto', pular: 'Saltar', voltar: 'Atrás', proximo: 'Siguiente', entendi: 'Entendido', fechar: 'Cerrar (Esc)',
      passo: 'Paso {n} de {t}', novidades: 'Novedades de la v{v}', verGuia: 'Ver la guía',
    },
    tutorial: [
      { t: 'Bienvenido al Piloto', x: 'El Piloto juega por ti aquí dentro de PokeIdle: elige la mejor hunt, repone bolas y pociones, y cuida del equipo y del Mercado. Solo gasta oro y siempre dentro del Cofre; gemas y diamantes, nunca.' },
      { t: 'Off, Manual y Auto', x: 'Arriba está el modo. Off: no corre nada. Manual: tú activas y ajustas cada automatización. Auto: el Piloto activa todo y calcula los números; cada fila mantiene su ON/OFF.' },
      { t: 'El Cofre manda en el gasto', x: 'Antes de encenderlo, abre la pestaña Cofre y revisa la reserva (el oro que nunca se gasta) y el tope del día. Toda compra del Piloto pasa por él.' },
      { t: 'Las pestañas', x: 'Cazar: cambio de hunt, reposición y rotación del equipo. Nivel: cuándo sube cada uno. Rutina: Pase, XP Share, PvP y Depot. Mercado: el Radar avisa, compra y revende en oro.' },
      { t: 'El equipo en el panel del juego', x: 'En el panel Equipo del juego aparecen el botón del Equipo (el equipo del campo y del PvP, y el meta del Clasificatorio) y el ⏱ de cada pokémon, con su turno y la fila de la rotación.' },
      { t: 'Ayuda siempre a mano', x: 'El ? de cada fila explica lo que hace. Debajo del menú están Reportar error, Buscar actualización y el idioma. Esta guía vuelve con el botón ? de arriba.' },
    ],
    novidades: {
      '1.31.1': [
        "Corregido: el Ancient Pupitar (y las otras variantes de la Outland) ya no cuenta como \"ya tenía\" en Cazar el meta: no evolucionan.",
      ],
      '1.31.0': [
        'Ahora también funciona en Edge, Brave, Opera GX y Firefox.',
        'Modo Manual liberado: tú activas y ajustas cada automatización.',
        'Rotación del equipo por turno: en Manual eliges cuánto dura el turno.',
        'El TIEMPO de la Sesión del juego ganó un cuadro con los días.',
        'Cazar el meta ya no va a la Outland: los pokémon de allí no evolucionan.',
        'Esta guía de primer uso y el cuadro de novedades (botón ? de arriba).',
        "La reposición elige sola una bola, una poción y un revivir según tu cuenta y los cambia a medida que sube.",
        "El equipo solo recibe pokémon del meta; el meta que sigue solo cambia después de 24 h.",
      ],
    },
  };
})(globalThis);
