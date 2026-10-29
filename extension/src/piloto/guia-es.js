// Textos de la guía de primer uso y de las novedades (regla 12 del hub) — ESPAÑOL.
// En cada versión nueva: agrega la entrada en `novidades` en los tres archivos (pt, en, es), en
// frases cortas, pensadas para quien usa. Solo la versión actual aparece en el cuadro.
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  (PIH.guiaTextos = PIH.guiaTextos || {}).es = {
    ui: {
      comoUsar: 'Cómo usar el Piloto', pular: 'Saltar', voltar: 'Atrás', proximo: 'Siguiente', entendi: 'Entendido', fechar: 'Cerrar (Esc)',
      passo: 'Paso {n} de {t}', novidades: 'Novedades de la v{v}', verGuia: 'Ver la guía', eMais: 'y {n} más — la lista completa está en GitHub',
      versaoUrgente: 'Actualización urgente v{v}', urgentePausado: 'El Piloto está en pausa hasta que actualices.', novaVersao: 'Nueva versión v{v}', voceTem: 'Estás en la v{v}. Qué cambió:', atualizar: 'Actualizar', verNoGithub: 'Ver en GitHub',
      updMsg: {
        aplicando: 'Actualizando…',
        baixado: 'El zip nuevo se descargó (carpeta Descargas). Extráelo encima de la carpeta del Piloto: en 1 min como máximo se recarga solo y las pestañas del juego se recargan.',
        firefox: 'Firefox va a preguntar si quieres instalar la versión nueva: haz clic en Añadir. Las pestañas del juego se recargan solas.',
        'firefox-temporario': 'El zip nuevo se descargó. En about:debugging, quita el Piloto y carga el zip nuevo en "Cargar complemento temporal".',
        loja: 'El navegador aún no liberó la versión nueva: inténtalo de nuevo en un rato.',
        erro: 'No se pudo actualizar ahora. Inténtalo de nuevo con el botón Buscar actualización, en el panel.',
      },
    },
    tutorial: [
      { t: 'Bienvenido al Piloto', x: 'El Piloto juega por ti aquí dentro de PokeIdle: elige la mejor hunt, repone bolas y pociones, y cuida del equipo y del Mercado. Solo gasta oro y siempre dentro del Cofre; gemas y diamantes, nunca. El botón Piloto está justo encima de tu pokémon en el campo: por ahí se abre el panel.' },
      { t: 'Off, Manual y Auto', x: 'Arriba está el modo. Off: no corre nada. Manual: tú activas y ajustas cada automatización. Auto: el Piloto activa todo y calcula los números; cada fila mantiene su ON/OFF. Emergencia: Alt+Shift+P pone todo en Off al instante, desde cualquier pestaña del navegador.' },
      { t: 'El Cofre manda en el gasto', x: 'Antes de encenderlo, abre la pestaña Cofre y revisa la reserva (el oro que nunca se gasta) y el tope del día. Toda compra del Piloto pasa por él.' },
      { t: 'Las pestañas', x: 'Cazar: cambio de hunt, reposición y rotación del equipo. Nivel: cuándo sube cada uno. Rutina: Pase, XP Share, PvP y Depot. Mercado: el Radar avisa, compra y revende en oro.' },
      { t: 'El equipo en el panel del juego', x: 'En el panel Equipo del juego aparecen el botón del Equipo (el equipo del campo y del PvP, y el meta del Clasificatorio) y el ⏱ de cada pokémon, con su turno y la fila de la rotación.' },
      { t: 'Ayuda siempre a mano', x: 'El ? de cada fila explica lo que hace. Debajo del menú están Reportar error, Buscar actualización y el idioma. Esta guía vuelve con el botón ? de arriba.' },
    ],
    novidades: {
      '1.31.1': [
        "Corregido: el Ancient Pupitar (y las otras variantes de la Outland) ya no cuenta como \"ya tenía\" en Cazar el meta: no evolucionan.",
      ],
      '1.40.0': [
        "Mantener el PC despierto (pestaña Cazar): con el juego abierto y el Piloto en Manual o Auto, el ordenador no entra en suspensión; la pantalla puede apagarse normalmente. No funciona en Firefox. Y cuando \"Volver solo si el juego se cae\" recarga el juego, llega una notificación.",
      ],
      '1.39.0': [
        "Avisos de hallazgos (pestaña Rutina): shiny en el campo, shiny capturado, captura P5 y drop raro (Boss Token, fragmentos, piezas de TM, tickets). Con el juego a la vista, una tarjetita en la esquina; con él oculto, la notificación del sistema. La fila muestra lo que cayó hoy.",
      ],
      '1.38.0': [
        "Parada de emergencia: Alt+Shift+P pone el Piloto en Off al instante, desde cualquier pestaña del navegador. Un cuadro lo confirma y tiene el botón para volver al modo anterior. La tecla se puede cambiar en chrome://extensions/shortcuts.",
      ],
      '1.37.1': [
        'Equipo: un pokémon fuera del meta ya no se queda con el lugar. Si atrapas otro fuera del meta con más Poder, entra en lugar del más débil. Los del meta siguen teniendo prioridad.',
      ],
      '1.37.0': [
        "Nueva pestaña Dudas: el Piloto puede responder solo preguntas en el canal Dudas del chat, con 53 respuestas sacadas de la Pokepedia del juego. Viene apagado; actívalo en la pestaña si quieres. Espera 20 s, no responde si alguien ya ayudó y habla como máximo 1 vez cada 5 min.",
      ],
      '1.36.2': [
        "Evolucionar: la piedra del equipo ahora usa la misma reserva que las pociones (y no los 5 M del Mercado), así que una cuenta con poco oro también la compra — sin pasar de la mitad del oro libre, para que no falten pociones.",
        "PvP en vivo: el nombre de cada entrenador en una etiqueta azul (tú) o roja (el rival) y cada pokémon en un cuadradito claro — sin el fondo oscuro detrás.",
      ],
      '1.36.1': [
        "Reposición: revive y poción siempre van antes que la bola, y la bola solo usa el oro que sobra después de asegurar la próxima reposición de pociones — una cuenta con poco oro ya no se queda sin pociones.",
        "Reposición: cuando cambia la poción (o bola, o revive) elegida, el Piloto la cambia y compra al momento, en vez de pasar hasta 40 min sin comprar ninguna; y no baja a una poción más débil solo porque acaba de gastar.",
        "Evolucionar: si la bóveda no libera oro para la piedra (cuenta con poco oro), lo intenta de nuevo en 30 min, sin insistir.",
      ],
      '1.36.0': [
        "Evolucionar: el equipo evoluciona en cuanto llega al nivel — cualquier pokémon, el inicial también. Sin la piedra, el Piloto la compra al momento en el Mercado (con oro) y nunca va a la reventa.",
        "Evolucionar: corregido lo que trababa la evolución — la consulta de la piedra perdía el turno frente al Radar, la segunda piedra del mismo vendedor era rechazada y un comando perdido retenía al pokémon por 24 h.",
        "Plateia: opción \"Reabrir si se cierra\" — si la ventana de Twitch o Kick se cierra o se descarta de la memoria, el Piloto la reabre en hasta 1 min.",
        "PvP en vivo: los 6 de cada lado aparecen desde el inicio, en una lista vertical en cada esquina — marco en quien está luchando, apagándose al perder HP y gris cuando cae.",
      ],
      '1.35.0': [
        "Pestaña Meta de la ventana Equipo: botón \"Actualizar equipo\" — cambia ya al meta actual (en el Centro), muestra quién entra, quién sale y qué falta cazar; \"Cazar los que faltan\" solo cuando haces clic.",
        "Nueva pestaña Extracto: lo que gastaste y lo que entró, con el ícono del ítem o el pokémon, cuándo y hace cuánto; totales de hoy, 7 y 30 días.",
        "PvP en vivo: en la ventanita y en la pantalla completa de la partida, el nombre de cada entrenador y sus pokémon en las esquinas — apagándose al perder HP y grises cuando caen.",
      ],
      '1.34.1': [
        "Colección: el pokémon que la Auto Colección guardó por debajo del Nv 50 (el Mercado solo lo acepta desde ahí) y que no sirve para el equipo, el PvP ni el meta vuelve al Depot y se vende, en vez de quedarse parado.",
        "La versión del Piloto aparece, discreta, al lado del nombre en la barra de En campo.",
        "Botón Equipo: se pone dorado, con un punto rojo, cuando el meta cambia y aún no lo viste; al abrirlo va directo a la pestaña Meta.",
        "Al lado de tu rango aparece el resultado de la última clasificatoria: ▲ los PR que ganaste o ▼ los que perdiste.",
        "Pase de Batalla: cuando el Piloto recoge el premio del día, él mismo cierra el \"¡Increíble!\" y la ventana del Pase.",
        "La compra automática que no salió porque se cayó la conexión del juego lo intenta de nuevo sola cuando la conexión vuelve.",
      ],
      '1.34.0': [
        "Versión nueva: el Piloto busca solo al abrir el juego, cada 30 min y cuando vuelves a la pestaña, y muestra el aviso al instante, sin recargar. La X solo lo pospone 1 h; una actualización urgente pausa el Piloto hasta que actualices.",
        "Modo Manual: pestaña Objetivos en el Mercado — para cada ítem, el tope en oro y cuántas unidades comprar; el Radar compra solo cuando aparece en el tope o por debajo. También objetivos de pokémon en oro (P5 y nota mínima).",
        "Modo Manual: con \"Calcular los límites solo\" apagado, los límites del Mercado se vuelven campos para escribir, y el F5 ya no deshace lo que ajustaste.",
        "Reposición: el revive, la poción o la ball elegidos para la cuenta se vuelven a comprar cuando se acaban, aunque el juego los desmarque por estar en cero.",
        "Rotación: si el turno termina durante una ida al Centro (una reposición, por ejemplo), el cambio se hace en ese mismo viaje, sin volver antes a la hunt.",
      ],
      '1.33.9': [
        "Reventa automática: lo que compras a mano (en el Mercado, con un clic en el Radar o un pokémon) nunca se anuncia solo; solo entra en la reventa lo que llegó solo (drops o compras automáticas del Radar).",
        "La piedra que el equipo va a gastar para evolucionar queda fuera de la reventa mientras la necesite.",
      ],
      '1.33.7': [
        "En campo: un \"+N\" dorado junto al nivel muestra cuántos niveles subió el pokémon en este turno de la rotación (solo aparece si subió; empieza de nuevo cuando vuelve).",
      ],
      '1.33.6': [
        "Las novedades muestran solo lo que cambió desde la última versión que viste (máximo 6 líneas).",
      ],
      '1.33.5': [
        "Evolución automática: la piedra que el Radar compra para el equipo ya no va a la reventa (antes el pokémon se quedaba esperando y el Radar compraba otra cada 30 min); si el Radar ya tiene la piedra en stock, usa una de ahí.",
      ],
      '1.33.4': [
        "Rotación: cuando la hunt nunca da una pausa de combate (el pokémon débil no deja de recibir golpes), a los 2 min el siguiente de la fila entra ahí mismo, limpia la hunt y sigue al Centro y a su mejor hunt. El orden no cambia.",
        "Si el siguiente de la fila no aguanta esa hunt, el más fuerte del equipo entra solo para limpiar; no cuenta como turno ni pierde su lugar en la fila.",
        "Sin VIP: la pokébola automática sigue lanzando con la ventana minimizada (Chrome frenaba el reloj a una vez por minuto).",
      ],
      '1.33.3': [
        "La compra automática del Mercado ahora va por tu dinero: compra lo que da ganancia mientras el stock del radar más la compra no pase de la mitad de lo que tienes; al vender, se libera de nuevo. Salió del tope del día.",
        "Cuando el juego avisa \"Devagar aí — muitas mensagens\" (demasiados mensajes), el radar y el Piloto bajan el ritmo solos y vuelven a subir de a poco.",
        "La bola tiene en cuenta el saldo: una cuenta con mucho oro usa la Ultra Ball aunque esté subiendo un pokémon débil.",
      ],
      '1.33.0': [
        "Reposición para cuenta nueva: el Piloto marca una bola, una poción y un revivir al instante y compra el primer lote en cuanto hay oro (guarda solo el 10% del saldo).",
        "Las cantidades de la reposición salen de lo que tu cuenta gasta de verdad (mínimo de 1 h, objetivo de 6 h), y la poción es la de menos oro por HP que cura.",
        "Pestaña Cazar: el oro/h ya descuenta las pociones, y la hunt donde los desmayos quitan más XP de lo que dan queda marcada como riesgo.",
        "Cazar el meta ya no salta a nadie: prueba cada pokémon del equipo y, sin hunt segura, espera farmeando XP hasta que el entrenador suba de nivel.",
      ],
      '1.32.3': [
        "La Plateia tampoco abre una sala repetida después de actualizar el Piloto o con la escala de Windows (adopta la ventana que ya está abierta).",
        "Pestaña Cazar: la hunt donde el pokémon muere antes de terminar un abate sale del ranking (ej.: Larvitar Nv 20 en la Ledyba Nv 230), y con \"Evitar riesgo\" las arriesgadas quedan después de las seguras.",
        "La primera vez, el Piloto abre en el idioma del navegador (portugués, inglés o español); el selector PT · EN · ES sigue en el panel.",
        "Versión nueva, novedades y la guía aparecen solas en el medio de la pantalla del juego, sin abrir el panel. La X o el Esc las cierran.",
        "Las salas de Plateia ya no se abren de nuevo cuando el juego o la extensión se reinicia: solo se abre la que falta.",
        "La rotación, al volver a encenderse, empieza por el pokémon más débil y deja el más fuerte para el final.",
        "Cazar el meta también apaga la rotación del equipo; vuelve junto con el Cambio de hunt.",
        "Torneos: el Piloto te inscribe solo en el Mundial, el Amateur y el Showdown en cuanto abren las inscripciones (pestaña Rutina).",
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
