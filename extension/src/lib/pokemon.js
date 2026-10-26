// Pokémon (Fase 4): o valor de mercado de um anúncio pelas vendas parecidas dos últimos 30 dias,
// e a decisão de avisar ou comprar. Cada pokémon é único (nível, nota, potência, IV), e o preço da
// mesma espécie varia de 750 mil a 350 mi: por isso a referência vem só de vendas parecidas, e é o
// 25º percentil delas (o quarto mais barato), não a média.
//
// A nota pesa em degraus (vendas em ouro de 2026-10-15, preço comparado com a mediana da espécie):
// 0,8× abaixo de 3,6; 1× de 3,6 a 3,7; 1,3× de 3,7 a 3,9; 6× de 3,9 a 4,0; 40× de 4,0 a 4,3; 83×
// acima. A potência P5 vale o dobro, e P1 a P4 ficam perto de 1×. Por isso a venda parecida fica na
// mesma faixa de nota e de potência, e não só perto na nota.
//
// Em Gemas (só análise, sem compra): as vendas parecidas são as em Gemas, shiny com shiny, e a
// comissão é por faixa do total.
//
// Nota de ataque (0.6.2): a nota do jogo soma os seis atributos de nascimento, e cada ponto de IV
// vale igual em qualquer um. O dano só usa o lado de ataque dos golpes da espécie (físico: ATK;
// especial: Sp.ATK; a Investida é sempre física) e o IV de SPD. A nota de ataque é a mesma régua
// da nota (0 = pior nascimento da espécie, 10 = P5 shiny com tudo no máximo), contando só o que
// bate. A parte física e a especial de cada espécie vêm de lib/especies.js. Funções puras.
(function (raiz, fabrica) {
  const node = typeof module === 'object' && module.exports;
  const m = fabrica(node ? require('./config.js') : raiz.RadarConfig, node ? require('./especies.js') : raiz.RadarEspecies);
  if (node) module.exports = m;
  else raiz.RadarPokemon = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config, Especies) {
  'use strict';

  const TAXA = Config.TAXA_VENDA;
  const DIARIA_PADRAO = 100000; // welcome.mercado.taxaDiaria
  const MIN_PARECIDAS_AVISO = 5;
  const MIN_PARECIDAS_AUTO = 8;
  // Com 5 a 7 vendas parecidas, a compra automática compra quando dá lucro MESMO vendendo pelo
  // preço da parecida mais barata dos 30 dias (o pior caso), depois da taxa e da diária.
  // 1.20 (pedido do André, 2026-10-23, depois da Vespiquen a 3 mi com a mais barata a 5 mi): antes
  // só comprava até 10% da mais barata (regra do Allan de 2026-10-18), e deixava passar quase tudo.
  // O lucro mínimo continua sendo contado pela referência (o p25), como no aviso.
  const RAZAO_DA_MAIS_BARATA_AUTO = 0.1; // só para compatibilidade (não decide mais nada)
  const NOTA_PERTO = 0.15;
  const DESCONTO_QUASE = 0.5;
  // Degraus da nota (limite de cima de cada faixa).
  const FAIXAS_NOTA = [3.7, 3.9, 4.0, 4.3, Infinity];
  // Comissão do pokémon vendido em Gemas: 13% até 500, 10% de 501 a 5.000, 7,5% acima, por faixa
  // do total (welcome.mercado.faixasOrb), arredondada para cima.
  const FAIXAS_ORB = [{ ate: 500, pct: 13 }, { ate: 5000, pct: 10 }, { ate: null, pct: 7.5 }];

  // A nota de ataque do anúncio contra a mediana das parecidas: 0,5 abaixo é uns 15% menos dano.
  const LIMIAR_ATAQUE = 0.5;
  const MIN_COM_IV = 3; // parecidas com IV por atributo para comparar
  const BONUS_POTENCIA = [0, 0.05, 0.1, 0.25, 1]; // shared/nota-pokemon.mjs do jogo
  const CHAVES_IV = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];

  const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

  function lerIvs(v) {
    if (!v || typeof v !== 'object') return null;
    const o = {};
    for (const k of CHAVES_IV) {
      const n = numero(v[k]);
      if (n === null) return null;
      o[k] = n;
    }
    return o;
  }

  // ---- nota de ataque ------------------------------------------------------------------------

  let porNome = null;
  function perfilDaEspecie(speciesId, nome) {
    const perfis = (Especies && Especies.PERFIS) || {};
    const p = speciesId !== null && speciesId !== undefined ? perfis[speciesId] : null;
    if (p && (!nome || p[0] === nome)) return p;
    if (!nome) return null;
    if (!porNome) porNome = new Map(Object.values(perfis).map((x) => [x[0], x]));
    return porNome.get(nome) || null;
  }

  const multPotencia = (p) => 1 + (BONUS_POTENCIA[(Math.round(p) || 1) - 1] ?? 0);

  // Dano relativo: a parte física com o ATK, a especial com o Sp.ATK (base + 2 × IV), vezes a
  // qualidade (^0,8, como no jogo), a potência, o shiny (×3) e o ganho do IV de SPD.
  function forcaDeAtaque({ ivs, qualidade, potencia, shiny }, perfil) {
    const [, bA, bS, , fis, esp, kv] = perfil;
    const iv = (k) => limitar(Number(ivs[k]) || 1, 1, 32);
    const lado = (fis * (bA + 2 * iv('atk'))) / (bA + 32) + (esp * (bS + 2 * iv('spAtk'))) / (bS + 32);
    const q = limitar(Number(qualidade) || 1, 0.8, 1.8);
    return lado * q ** 0.8 * multPotencia(limitar(Number(potencia) || 1, 1, 5)) * (shiny ? 3 : 1) * (1 + kv * (iv('speed') - 1));
  }

  // 0 a 10 dentro da espécie, em escala log como a nota do jogo; null sem IV por atributo ou sem perfil.
  function notaDeAtaque(f) {
    if (!f || !f.ivs) return null;
    const perfil = perfilDaEspecie(f.speciesId, f.nome);
    if (!perfil || !(perfil[4] + perfil[5] > 0)) return null;
    const min = forcaDeAtaque({ ivs: { atk: 1, spAtk: 1, speed: 1 }, qualidade: 0.8, potencia: 1, shiny: false }, perfil);
    const max = forcaDeAtaque({ ivs: { atk: 32, spAtk: 32, speed: 32 }, qualidade: 1.8, potencia: 5, shiny: true }, perfil);
    const v = forcaDeAtaque(f, perfil);
    return Math.round(limitar((10 * Math.log(v / min)) / Math.log(max / min), 0, 10) * 100) / 100;
  }

  // ---- a nota do jogo (0.7.0) -----------------------------------------------------------------

  // A nota dos pokémon da sua conta não vem do servidor: o cliente do jogo calcula na tela
  // (`shared/nota-pokemon.mjs`, `notaPokemon`). Esta é a mesma conta, com o piso da linhagem
  // (evoluir sobe a nota pelo menos 0,1 por passo sobre a de cada forma anterior). Os anúncios e as
  // vendas trazem a nota pronta, e lá vale a do servidor.
  const GANHO_MIN_EVOLUCAO = 0.1;
  const STATS_NOTA = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
  const EXPO_QUALIDADE = { hp: 0.95, atk: 0.8, def: 0.8, spAtk: 0.8, spDef: 0.8, speed: 0.95 };
  const REF_BASE = { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, speed: 80 };
  const IV_MIN = 6;
  const IV_MAX = 192;

  function ivsDeSoma(soma) {
    const s = limitar(Math.round(Number(soma) || IV_MIN), IV_MIN, IV_MAX);
    const med = Math.floor(s / 6);
    const ivs = Object.fromEntries(STATS_NOTA.map((k) => [k, med]));
    for (let i = 0; i < s - med * 6; i++) ivs[STATS_NOTA[i % 6]]++;
    return ivs;
  }

  function somaNascimento({ iv, ivs, qualidade, potencia, shiny, bases }) {
    const b = bases || REF_BASE;
    const v = ivs || ivsDeSoma(iv);
    const q = limitar(Number(qualidade) || 1, 0.8, 1.8);
    const mult = multPotencia(limitar(Math.round(Number(potencia) || 1), 1, 5)) * (shiny ? 3 : 1);
    let soma = 0;
    for (const k of STATS_NOTA) soma += Math.round((b[k] + 2 * (Number(v[k]) || 1)) * q ** EXPO_QUALIDADE[k] * mult);
    return soma;
  }

  function limitesForca(bases) {
    const min = somaNascimento({ iv: IV_MIN, qualidade: 0.8, potencia: 1, shiny: false, bases });
    const max = somaNascimento({ iv: IV_MAX, qualidade: 1.8, potencia: 5, shiny: true, bases });
    return { min: Math.max(1, min), max: Math.max(min + 1, max) };
  }

  function notaDeForca(soma, { min, max }) {
    const s = limitar(Number(soma) || min, min, max);
    const bruta = (10 * (Math.log(Math.max(1, s)) - Math.log(min))) / (Math.log(max) - Math.log(min));
    return Math.round(limitar(bruta, 0, 10) * 1000) / 1000;
  }

  const LIMITES_REF = limitesForca(REF_BASE);
  const scoreForca = (args) => limitar(notaDeForca(somaNascimento(args), LIMITES_REF) / 10, 0, 1);

  // bases: a espécie com o refino; basesLimites: a espécie sem refino (a régua de 0 a 10).
  function notaPeloNascimento({ iv, ivs, qualidade, potencia, shiny, bases, basesLimites }) {
    const min = scoreForca({ iv: IV_MIN, qualidade: 0.8, potencia: 1, shiny: false, bases: basesLimites });
    const max = Math.max(min, scoreForca({ iv: IV_MAX, qualidade: 1.8, potencia: 5, shiny: true, bases: basesLimites }));
    const s = limitar(scoreForca({ iv, ivs, qualidade, potencia, shiny, bases }) || min, min, max);
    if (max <= min) return 0;
    return Math.round(((10 * (s - min)) / (max - min)) * 1000) / 1000;
  }

  // f: { speciesId, nome, ivs ou ivTotal, qualidade, potencia, shiny, refinoStats }. null sem a espécie.
  function notaDoJogo(f) {
    const perfil = f ? perfilDaEspecie(f.speciesId, f.nome) : null;
    if (!perfil || perfil.length < 10) return null;
    const [, atk, spAtk, speed, , , , hp, def, spDef] = perfil;
    const basesLimites = { hp, atk, def, spAtk, spDef, speed };
    const r = f.refinoStats || {};
    const mais = (k) => Math.max(0, Math.floor(Number(r[k]) || 0));
    const bases = { hp: hp + mais('hp'), atk: atk + mais('atk'), def: def + mais('def'), spAtk: spAtk + mais('spAtk'), spDef: spDef + mais('spDef'), speed };
    const iv = f.ivTotal ?? (f.ivs ? STATS_NOTA.reduce((soma, k) => soma + (Number(f.ivs[k]) || 0), 0) : null);
    if (iv === null) return null;
    const nasc = { iv, ivs: f.ivs, qualidade: f.qualidade, potencia: f.potencia, shiny: f.shiny };
    let nota = notaPeloNascimento({ ...nasc, bases, basesLimites });
    for (const [aHp, aAtk, aDef, aSpAtk, aSpDef, aSpeed, passos] of perfil[10] || []) {
      const b = { hp: aHp, atk: aAtk, def: aDef, spAtk: aSpAtk, spDef: aSpDef, speed: aSpeed };
      const piso = Math.min(10, notaPeloNascimento({ ...nasc, bases: b, basesLimites: b }) + (Number(passos) || 1) * GANHO_MIN_EVOLUCAO);
      if (piso > nota) nota = piso;
    }
    return Math.round(nota * 1000) / 1000;
  }

  // Os IV que batem, do que mais pesa para o que menos: "Sp.ATK 29 · ATK 9 · SPD 19".
  function ivUtil(f) {
    if (!f || !f.ivs) return null;
    const perfil = perfilDaEspecie(f.speciesId, f.nome);
    if (!perfil) return null;
    const [, , , , fis, esp] = perfil;
    const lados = [['ATK', 'atk', fis], ['Sp.ATK', 'spAtk', esp]].sort((x, y) => y[2] - x[2]).filter((x, i) => i === 0 || x[2] >= 0.15);
    return [...lados.map(([r, k]) => `${r} ${f.ivs[k]}`), `SPD ${f.ivs.speed}`].join(' · ');
  }

  // O anúncio contra as vendas da lista (as parecidas, ou as de baixo): a mediana da nota de ataque
  // das que têm IV por atributo. baixo: bate bem menos que elas (o barato tem motivo); forte: bate
  // bem mais (o mercado olhou só a nota).
  function compararAtaque(a, lista) {
    const nota = a && typeof a.notaAtaque === 'number' ? a.notaAtaque : null;
    const notas = (lista || []).map((v) => v.notaAtaque).filter((n) => typeof n === 'number');
    if (nota === null || notas.length < MIN_COM_IV) return { nota, mediana: null, n: notas.length, baixo: false, forte: false };
    const mediana = percentil(notas, 0.5);
    return { nota, mediana, n: notas.length, baixo: nota < mediana - LIMIAR_ATAQUE - 1e-9, forte: nota >= mediana + LIMIAR_ATAQUE - 1e-9 };
  }

  // Os atributos que importam para o preço, da ficha do jogo.
  function lerFicha(f) {
    if (!f || typeof f !== 'object') return null;
    const r = {
      speciesId: numero(f.speciesId),
      nome: typeof f.nome === 'string' ? f.nome : null,
      nivel: numero(f.level),
      nota: numero(f.nota),
      potencia: numero(f.potencia),
      qualidade: numero(f.quality),
      ivTotal: numero(f.ivTotal),
      ivs: lerIvs(f.ivs),
      refino: numero(f.refinoTotal),
      refinoStats: f.refino && typeof f.refino === 'object' ? f.refino : null,
      shiny: Boolean(f.shiny),
      tm: Boolean(f.tmAoe || f.tmElemental),
    };
    r.notaAtaque = notaDeAtaque(r);
    return r;
  }

  // Uma linha de market.listar (aba vitrine). Devolve null se não for pokémon.
  function lerAnuncio(l, meuId) {
    if (!l || l.tipo !== 'pokemon') return null;
    const f = lerFicha(l.ficha);
    if (!f) return null;
    return {
      ...f,
      id: numero(l.id),
      pokemonId: numero(l.pokemonId),
      preco: numero(l.preco),
      moeda: l.moeda || null,
      compravelEm: numero(l.compravelEm),
      criadoEm: numero(l.criadoEm),
      estado: l.estado ?? null,
      meu: meuId !== null && meuId !== undefined && l.vendedorId === meuId,
    };
  }

  // Uma venda da Tabela de preços (market.historicoGlobal) ou da fixture.
  function lerVenda(l) {
    if (!l) return null;
    if (l.ficha) {
      const f = lerFicha(l.ficha);
      return f && { ...f, preco: numero(l.bruto), moeda: l.moeda || null, em: numero(l.em) ?? l.em ?? null, pokemonId: numero(l.pokemonId) };
    }
    const r = { speciesId: numero(l.speciesId), nome: l.nome || null, nivel: numero(l.nivel), nota: numero(l.nota), potencia: numero(l.potencia), qualidade: numero(l.qualidade), ivTotal: numero(l.ivTotal), ivs: lerIvs(l.ivs), shiny: Boolean(l.shiny), preco: numero(l.preco), moeda: l.moeda || null, em: l.em ?? null };
    r.notaAtaque = notaDeAtaque(r);
    return r;
  }

  const faixaPotencia = (p) => ((p ?? 1) >= 5 ? 'P5' : 'P1 a P4');
  const faixaNota = (n) => FAIXAS_NOTA.findIndex((ate) => (n ?? 0) < ate);
  const NOMES_FAIXA_NOTA = ['até 3,7', '3,7 a 3,9', '3,9 a 4,0', '4,0 a 4,3', 'acima de 4,3'];
  const nomeFaixaNota = (n) => NOMES_FAIXA_NOTA[faixaNota(n)] || '-';
  const faixaNivel = (n) => ((n ?? 0) > 100 ? 'alto' : 'baixo');
  const mesmaEspecie = (a, b) => (a.speciesId !== null && b.speciesId !== null ? a.speciesId === b.speciesId : Boolean(a.nome) && a.nome === b.nome);

  // b é parecido com a: mesma espécie, mesmo shiny, nota perto e na mesma faixa de nota, e as
  // mesmas faixas de potência e de nível.
  const ehParecido = (b, a) => mesmaEspecie(b, a) && Boolean(b.shiny) === Boolean(a.shiny)
    && b.nota !== null && a.nota !== null && Math.abs(b.nota - a.nota) <= NOTA_PERTO + 1e-9 && faixaNota(b.nota) === faixaNota(a.nota)
    && faixaPotencia(b.potencia) === faixaPotencia(a.potencia) && faixaNivel(b.nivel) === faixaNivel(a.nivel);

  // Vendas parecidas na mesma moeda do anúncio.
  function parecidas(vendas, a) {
    const moeda = a.moeda || 'gold';
    return (vendas || []).map(lerVenda).filter((v) => v && positivo(v.preco) && v.moeda === moeda && ehParecido(v, a));
  }

  // Percentil pelo posto mais próximo, de baixo: com 5 vendas, o 25º é a 2ª mais barata.
  // (Declarada como função: compararAtaque, acima, também usa.)
  function percentil(valores, p) {
    const v = [...valores].sort((x, y) => x - y);
    if (!v.length) return null;
    return v[Math.max(0, Math.ceil(p * v.length) - 1)];
  }

  // outros: anúncios à venda (lerAnuncio) para achar o menor parecido, sem o próprio.
  function referencia({ anuncio, vendas, outros }) {
    const ps = parecidas(vendas, anuncio);
    const precos = ps.map((v) => v.preco);
    const p25 = percentil(precos, 0.25);
    const aVenda = (outros || []).filter((o) => o && o.id !== anuncio.id && !o.meu && o.moeda === (anuncio.moeda || 'gold') && positivo(o.preco) && ehParecido(o, anuncio));
    const menorAVenda = aVenda.length ? Math.min(...aVenda.map((o) => o.preco)) : null;
    const valor = p25 === null ? null : menorAVenda === null ? p25 : Math.min(p25, menorAVenda);
    return { valor, p25, n: ps.length, min: precos.length ? Math.min(...precos) : null, max: precos.length ? Math.max(...precos) : null, menorAVenda, fonte: valor === null ? null : valor === p25 ? 'vendas' : 'anuncio' };
  }

  // Pokémon de nota alta ou P5 quase nunca tem 5 vendas parecidas. Aí a comparação de segurança é
  // com os de qualidade logo abaixo (a faixa de nota anterior inteira, ou P1 a P4 no lugar de P5):
  // à venda por metade disso, ele vale menos que um pokémon pior, e é erro de preço quase certo.
  function referenciaDeBaixo({ anuncio: a, vendas }) {
    const moeda = a.moeda || 'gold';
    const lista = (vendas || []).map(lerVenda).filter((v) => v && positivo(v.preco) && v.moeda === moeda && mesmaEspecie(v, a)
      && Boolean(v.shiny) === Boolean(a.shiny) && faixaNivel(v.nivel) === faixaNivel(a.nivel) && v.nota !== null);
    const opcoes = [];
    const fn = faixaNota(a.nota);
    if (fn > 0) {
      const ps = lista.filter((v) => faixaNota(v.nota) === fn - 1 && faixaPotencia(v.potencia) === faixaPotencia(a.potencia));
      opcoes.push({ base: 'nota menor', ps });
    }
    if (faixaPotencia(a.potencia) === 'P5') {
      const ps = lista.filter((v) => faixaPotencia(v.potencia) === 'P1 a P4' && faixaNota(v.nota) === fn && Math.abs(v.nota - a.nota) <= NOTA_PERTO + 1e-9);
      opcoes.push({ base: 'potência menor', ps });
    }
    const boas = opcoes.filter((o) => o.ps.length >= MIN_PARECIDAS_AVISO)
      .map((o) => ({ base: o.base, n: o.ps.length, valor: percentil(o.ps.map((v) => v.preco), 0.25), ps: o.ps }));
    // A mais alta das duas: é o piso mais seguro para quem é melhor que ambas.
    return boas.length ? boas.sort((x, y) => y.valor - x.valor)[0] : null;
  }

  // O lucro de revender pela referência: 15% de comissão e um dia de diária.
  const lucroDe = (ref, preco, diaria = DIARIA_PADRAO) => Math.floor(ref * (1 - TAXA)) - preco - diaria;

  function comissaoGemas(total, faixas = FAIXAS_ORB) {
    let resto = total;
    let piso = 0;
    let soma = 0;
    for (const f of faixas) {
      const teto = f.ate === null ? Infinity : f.ate;
      const parte = Math.max(0, Math.min(resto, teto - piso));
      soma += (parte * f.pct) / 100;
      resto -= parte;
      piso = teto;
      if (resto <= 0) break;
    }
    return Math.ceil(soma);
  }
  // Em Gemas a diária (100.000 Coins) sai em ouro: não entra no lucro em Gemas.
  const lucroGemasDe = (ref, preco, faixas) => ref - comissaoGemas(ref, faixas) - preco;

  // Devolve { aviso, quase, motivos, desconto, lucro, ref }.
  // Em ouro: aviso (e compra) ou quase aviso. Em Gemas: só análise, as mesmas contas, com o lucro
  // em Gemas e o motivo "em Gemas: só análise"; nunca vira aviso.
  function avaliar({ anuncio: a, vendas, outros, config, diaria = DIARIA_PADRAO, saldo, faixasOrb }) {
    const motivos = [];
    if (!a) return { aviso: false, quase: false, motivos: ['sem anúncio'] };
    const gemas = a.moeda === 'orb';
    if (a.meu) motivos.push('anúncio seu');
    if (a.moeda !== 'gold' && !gemas) motivos.push('moeda desconhecida');
    if (a.shiny && !gemas) motivos.push('shiny');
    if (!positivo(a.preco)) motivos.push('sem preço');
    const ref = referencia({ anuncio: a, vendas, outros });
    // Poucas parecidas (nota alta, P5): só a comparação de segurança, e só para análise.
    if (ref.n < MIN_PARECIDAS_AVISO) {
      const baixo = referenciaDeBaixo({ anuncio: a, vendas });
      if (baixo && positivo(a.preco) && !a.meu && (gemas || !a.shiny)) {
        const descontoBaixo = 1 - a.preco / baixo.valor;
        if (descontoBaixo >= DESCONTO_QUASE) {
          const lucroBaixo = gemas ? lucroGemasDe(baixo.valor, a.preco, faixasOrb) : lucroDe(baixo.valor, a.preco, diaria);
          const ataque = compararAtaque(a, baixo.ps);
          const m = [...motivos, `poucas vendas parecidas: abaixo das de ${baixo.base}`];
          if (ataque.baixo) m.push('IV útil baixo');
          if (gemas) m.push('em Gemas: só análise');
          return { aviso: false, quase: true, motivos: m, ref: { ...ref, valor: baixo.valor, p25: baixo.valor, n: baixo.n, fonte: 'abaixo', base: baixo.base }, desconto: descontoBaixo, lucro: lucroBaixo, faixaNota: nomeFaixaNota(a.nota), ataque };
        }
      }
    }
    const ataque = compararAtaque(a, parecidas(vendas, a));
    if (ref.valor === null) return { aviso: false, quase: false, motivos: [...motivos, 'sem vendas parecidas'], ref, desconto: null, lucro: null, ataque };
    const desconto = 1 - a.preco / ref.valor;
    const lucro = gemas ? lucroGemasDe(ref.valor, a.preco, faixasOrb) : lucroDe(ref.valor, a.preco, diaria);
    if (ref.n < MIN_PARECIDAS_AVISO) motivos.push('poucas vendas parecidas');
    // Barato porque bate menos que as parecidas: não avisa nem compra (vai para o registro).
    if (ataque.baixo) motivos.push('IV útil baixo');
    if (!(desconto >= config.descontoMinimoPokemon)) motivos.push('desconto abaixo do mínimo');
    if (!(lucro >= (gemas ? config.lucroMinimoGemas : config.lucroMinimoPokemon))) motivos.push('lucro abaixo do mínimo');
    if (!gemas && typeof saldo === 'number' && saldo < a.preco) motivos.push('saldo não paga');
    if (gemas) motivos.push('em Gemas: só análise');
    const aviso = motivos.length === 0;
    let quase = !aviso && !a.meu && (gemas || !a.shiny) && desconto >= DESCONTO_QUASE;
    // Só para análise: bate bem mais que as parecidas e custa como elas (ou menos).
    if (!aviso && ataque.forte && !a.meu && (gemas || !a.shiny) && desconto >= 0 && ref.n >= MIN_PARECIDAS_AVISO) {
      motivos.push('forte a preço de nota');
      quase = true;
    }
    return { aviso, quase, motivos, desconto, lucro, ref, faixaNota: nomeFaixaNota(a.nota), ataque };
  }

  // A compra automática de pokémon: o aviso e mais as regras dela.
  function decidirAuto({ avaliacao: av, anuncio: a, config, gastoHoje = 0, saldo, diaria = DIARIA_PADRAO }) {
    const nao = (motivo) => ({ comprar: false, motivo });
    if (!config.compraAutomaticaPokemon) return nao('compra automática de pokémon desligada');
    if (!av || !av.aviso) return nao('não virou aviso');
    if (av.ref.n < MIN_PARECIDAS_AUTO) {
      const seguro = av.ref.n >= MIN_PARECIDAS_AVISO && positivo(av.ref.min) && lucroDe(av.ref.min, a.preco, diaria) > 0;
      if (!seguro) return nao('menos de 8 vendas parecidas e sem lucro vendendo pela mais barata');
    }
    if (positivo(config.gastoMaximoPokemon) && a.preco > config.gastoMaximoPokemon) return nao(config.calibrada ? 'acima do ouro livre do cofre (reserva ou teto do dia)' : 'acima do gasto máximo por pokémon');
    if (positivo(config.gastoMaximoDia) && config.gastoMaximoDia - gastoHoje < a.preco) return nao('teto do dia atingido');
    if (!(typeof saldo === 'number' && saldo >= a.preco)) return nao('saldo não paga');
    return { comprar: true, motivo: null };
  }

  // Texto curto dos atributos: "Nv 100 · nota 3,55 · IV 125 · P1 · ataque 3,10".
  function resumo(a) {
    const n = (v, casas = 0) => (typeof v === 'number' ? v.toFixed(casas).replace('.', ',') : '-');
    return `Nv ${n(a.nivel)} · nota ${n(a.nota, 2)} · IV ${n(a.ivTotal)} · P${n(a.potencia)}${a.shiny ? ' · shiny' : ''}${a.tm ? ' · TM' : ''}${typeof a.notaAtaque === 'number' ? ` · ataque ${n(a.notaAtaque, 2)}` : ''}`;
  }

  // O anúncio acompanhado saiu da vitrine? linhas: a lista "mais baratos" da espécie, na moeda
  // dele (página 0, 24 por página; a vitrine mostra também os retidos). true: saiu (não está e a
  // página cobre o preço dele, ou está fechado); false: continua; null: não dá para saber.
  function saiuDaVitrine(ac, linhas, porPagina = 24) {
    const lista = (linhas || []).filter((l) => l && typeof l === 'object');
    const achado = lista.find((l) => Number(l.id) === ac.anuncioId);
    if (achado) return Boolean(achado.estado && achado.estado !== 'aberto');
    if (lista.length < porPagina) return true;
    const maior = Math.max(...lista.map((l) => Number(l.preco) || 0));
    return maior >= ac.preco ? true : null;
  }

  // A venda para guardar e exportar (sem nick nenhum: a ficha chega ao radar sem eles).
  function vendaParaGuardar(l) {
    const v = lerVenda(l);
    if (!v || !positivo(v.preco) || !v.ivs) return null;
    return {
      chave: `${v.pokemonId ?? '-'}:${v.em ?? '-'}`, em: v.em, especie: v.nome, speciesId: v.speciesId, moeda: v.moeda || 'gold', preco: v.preco,
      nivel: v.nivel, nota: v.nota, notaAtaque: v.notaAtaque, ivUtil: ivUtil(v), qualidade: v.qualidade, potencia: v.potencia, shiny: v.shiny, tm: v.tm,
      refino: v.refino, ivTotal: v.ivTotal, ivs: v.ivs,
    };
  }

  return { DIARIA_PADRAO, MIN_PARECIDAS_AVISO, MIN_PARECIDAS_AUTO, RAZAO_DA_MAIS_BARATA_AUTO, NOTA_PERTO, FAIXAS_NOTA, LIMIAR_ATAQUE, faixaNota, nomeFaixaNota, faixaPotencia, comissaoGemas, lucroGemasDe, lerFicha, lerAnuncio, lerVenda, parecidas, percentil, referencia, referenciaDeBaixo, lucroDe, avaliar, decidirAuto, resumo, perfilDaEspecie, forcaDeAtaque, notaDeAtaque, ivUtil, compararAtaque, vendaParaGuardar, saiuDaVitrine, notaDoJogo, ehParecido };
});
