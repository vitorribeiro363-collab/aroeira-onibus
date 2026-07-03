// ════════════════════════════════════════════════════════════════════════════
// CONSTANTES GLOBAIS
// ════════════════════════════════════════════════════════════════════════════
const GOOGLE_KEY = "AIzaSyALM5rawvM2XcLTIgwGgqhee3j0XNo2wCE";
const DESTINO_LAT = -18.75178869719634;
const DESTINO_LON = -48.611748253811975;

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════
db.auth.getSession().then(({ data }) => {
  if (!data.session) {
    window.location.href = "/aroeira-onibus/gestao/index.html";
    return;
  }
  const u = data.session.user;
  const nome = u.email.split("@")[0];
  document.getElementById("userAvatar").textContent = nome[0].toUpperCase();
  document.getElementById("userName").textContent = nome;
  document.getElementById("userEmail").textContent = u.email;
  carregarDashboard();
});

async function sair() {
  await db.auth.signOut();
  window.location.href = "/aroeira-onibus/gestao/index.html";
}

// ════════════════════════════════════════════════════════════════════════════
// NAVEGAÇÃO
// ════════════════════════════════════════════════════════════════════════════
const titulos = {
  dashboard: ["Dashboard", "Visão geral do sistema"],
  incluir: ["Incluir Colaboradores", "Adicione via CSV ou manualmente"],
  excluir: ["Excluir Colaboradores", "Remova via CSV ou por matrícula"],
  editar: [
    "Editar Alocação",
    "Altere endereço ou force um ponto específico por matrícula",
  ],
  status: [
    "Status de Colaboradores",
    "Gerencie férias, afastamentos e desligamentos",
  ],
  rfid: ["Cadastro RFID", "Vincule o crachá RFID à matrícula do colaborador"],
  rotas: ["Gestão de Rotas", "Gerencie pontos, sequência e horários por linha"],
  consulta: ["Consultar Ponto", "Encontre o ponto mais próximo de um endereço"],
  mapaOcupacao: [
    "Mapa de Ocupação",
    "Visualize a quantidade de colaboradores por ponto no mapa",
  ],
  relatorio: ["Relatório de Pontos", "Ponto mais próximo por colaborador"],
  ocupacao: [
    "Ocupação por Linha",
    "Quantidade de colaboradores por linha e turno",
  ],
  ocupacaoPonto: ["Ocupação por Ponto", "Colaboradores por ponto de embarque"],
  conformidade: [
    "Conformidade de Embarque",
    "Compara ponto alocado vs ponto real de embarque",
  ],
  fds: [
    "Escala Fim de Semana",
    "Gerencie e otimize o transporte dos finais de semana",
  ],
};

function ir(tela) {
  document
    .querySelectorAll(".tela")
    .forEach((t) => t.classList.remove("ativa"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.querySelectorAll(".status-bar").forEach((s) => {
    s.style.display = "none";
    s.textContent = "";
  });

  // ← Reseta a tela de edição ao sair dela
  if (tela !== "editar") {
    const resultado = document.getElementById("editarResultado");
    const matriculaInput = document.getElementById("editarMatricula");
    if (resultado) resultado.style.display = "none";
    if (matriculaInput) matriculaInput.value = "";
    colaboradorEditarAtual = null;
  }
  if (tela !== "incluir") {
    document.getElementById("csvIncluir").value = "";
    document.getElementById("nomeArquivoIncluir").textContent =
      "Nenhum arquivo selecionado";
    document.getElementById("btnImportar").disabled = true;
    const detalhes = document.getElementById("detalhesImportacao");
    if (detalhes) detalhes.innerHTML = "";
    dadosCSVIncluir = [];
  }
  document.getElementById("tela-" + tela).classList.add("ativa");
  document.querySelector(`[onclick="ir('${tela}')"]`).classList.add("active");
  document.getElementById("topbarTitle").textContent = titulos[tela][0];
  document.getElementById("topbarSub").textContent = titulos[tela][1];

  if (tela === "dashboard") carregarDashboard();
  if (tela === "ocupacao") carregarOcupacao();
  if (tela === "rfid") carregarListaRfid();
  if (tela === "mapaOcupacao") carregarMapaOcupacao();
  if (tela === "status") carregarListaStatus();
  if (tela === "relatorio") carregarRelatorioSalvo();
  if (tela === "ocupacaoPonto") carregarOcupacaoPonto();
  if (tela === "fds") carregarHistoricoFds();
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
async function carregarDashboard() {
  await atualizarStatusVencidos();

  const { data: funcs } = await db
    .from("funcionarios")
    .select("id, latitude", { count: "exact" });
  const { data: pontos } = await db.from("pontos").select("linha");

  const total = funcs?.length ?? 0;
  const geocodificados = funcs?.filter((f) => f.latitude !== null).length ?? 0;
  const linhas = pontos ? [...new Set(pontos.map((p) => p.linha))].length : 0;
  const totalPontos = pontos?.length ?? 0;

  document.getElementById("statFuncionarios").textContent = total;
  document.getElementById("statPontos").textContent = totalPontos;
  document.getElementById("statLinhas").textContent = linhas;
  document.getElementById("statGeo").textContent = geocodificados;

  const { count: totalRfid } = await db
    .from("funcionarios")
    .select("id", { count: "exact" })
    .not("rfid_id", "is", null);

  const totalCadastrados = funcs?.length ?? 0;
  const pctRfid =
    totalCadastrados > 0
      ? Math.round(((totalRfid ?? 0) / totalCadastrados) * 100)
      : 0;
  document.getElementById("statRfid").textContent = totalRfid ?? 0;
  document.getElementById("statRfidPct").textContent =
    `${pctRfid}% dos cadastrados`;

  carregarLinhasRotas();
  carregarFiltroLinhaEmbarques();
  carregarTodosEmbarques();
  carregarStatusDashboard();
  carregarOcupacaoLinhasDashboard();
  carregarAlertasRetorno();
  carregarEmbarquesReais();
}

async function carregarStatusDashboard() {
  const hoje = new Date().toISOString().split("T")[0];

  // Total de colaboradores cadastrados
  const { count: total } = await db
    .from("funcionarios")
    .select("*", { count: "exact", head: true });

  // Férias e afastamentos em andamento hoje
  const { count: emAndamento } = await db
    .from("funcionarios")
    .select("*", { count: "exact", head: true })
    .in("status", ["ferias", "afastado"])
    .lte("status_inicio", hoje)
    .gte("status_fim", hoje);

  // Aptos para transporte hoje
  const aptosHoje = (total ?? 0) - (emAndamento ?? 0);

  document.getElementById("statAtivos").textContent = aptosHoje;
  document.getElementById("statFeriasAfastados").textContent = emAndamento ?? 0;
}

async function carregarFiltroLinhaEmbarques() {
  const { data } = await db.from("pontos").select("linha");
  if (!data) return;
  const linhas = [...new Set(data.map((p) => p.linha))].sort();
  const sel = document.getElementById("filtroLinhaEmbarques");
  if (!sel) return;
  sel.innerHTML = '<option value="">Todas as linhas</option>';
  linhas.forEach(
    (l) => (sel.innerHTML += `<option value="${l}">${l}</option>`),
  );
}

async function contarEmbarques(inicioISO, fimISO, linha) {
  let query = db
    .from("embarques")
    .select("id", { count: "exact" })
    .gte("hora", inicioISO);
  if (fimISO) query = query.lte("hora", fimISO);
  if (linha) query = query.eq("linha", linha);
  const { count } = await query;
  return count ?? 0;
}

async function carregarTodosEmbarques() {
  const linha = document.getElementById("filtroLinhaEmbarques")?.value;

  const agora = new Date();
  const inicioHoje = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate(),
  );

  const inicioOntem = new Date(inicioHoje);
  inicioOntem.setDate(inicioOntem.getDate() - 1);
  const fimOntem = new Date(inicioHoje);

  const inicio7dias = new Date(inicioHoje);
  inicio7dias.setDate(inicio7dias.getDate() - 6);

  const inicio15dias = new Date(inicioHoje);
  inicio15dias.setDate(inicio15dias.getDate() - 14);

  const inicio30dias = new Date(inicioHoje);
  inicio30dias.setDate(inicio30dias.getDate() - 29);

  const [hoje, ontem, sete, quinze, trinta] = await Promise.all([
    contarEmbarques(inicioHoje.toISOString(), null, linha),
    contarEmbarques(inicioOntem.toISOString(), fimOntem.toISOString(), linha),
    contarEmbarques(inicio7dias.toISOString(), null, linha),
    contarEmbarques(inicio15dias.toISOString(), null, linha),
    contarEmbarques(inicio30dias.toISOString(), null, linha),
  ]);

  document.getElementById("statEmbarquesHoje").textContent = hoje;
  document.getElementById("statEmbarquesOntem").textContent = ontem;
  document.getElementById("statEmbarques7dias").textContent = sete;
  document.getElementById("statEmbarques15dias").textContent = quinze;
  document.getElementById("statEmbarques30dias").textContent = trinta;
}

let dadosOcupacaoLinhasDashboard = {};

async function carregarOcupacaoLinhasDashboard() {
  const hoje = new Date().toISOString().split("T")[0];

  const { data: funcs } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    // .eq("status", "ativo")
    .order("matricula", { ascending: true });
  const { data: pontos } = await db.from("pontos").select("*");

  if (!funcs || !pontos) return;

  const funcsAptos = funcs.filter((f) => {
    if (
      (f.status === "ferias" || f.status === "afastado") &&
      f.status_inicio &&
      f.status_fim
    ) {
      return !(f.status_inicio <= hoje && f.status_fim >= hoje);
    }

    return true;
  });

  const ocupacaoLinhas = {};
  dadosOcupacaoLinhasDashboard = {};

  for (const f of funcsAptos) {
    const r = alocarColaborador(f, pontos, ocupacaoLinhas);
    if (!r?.ponto) continue;

    const linha = r.ponto.linha;
    ocupacaoLinhas[linha] = (ocupacaoLinhas[linha] || 0) + 1;

    if (!dadosOcupacaoLinhasDashboard[linha]) {
      dadosOcupacaoLinhasDashboard[linha] = { a: 0, b: 0, c: 0, total: 0 };
    }

    const jornada = (f.jornada || "").toLowerCase();
    if (jornada.includes("turno b") || jornada.includes("b -"))
      dadosOcupacaoLinhasDashboard[linha].b++;
    else if (jornada.includes("turno c") || jornada.includes("c -"))
      dadosOcupacaoLinhasDashboard[linha].c++;
    else dadosOcupacaoLinhasDashboard[linha].a++;

    dadosOcupacaoLinhasDashboard[linha].total++;
  }

  filtrarOcupacaoLinhasDashboard("a");
}

function filtrarOcupacaoLinhasDashboard(turno) {
  document.querySelectorAll(".btn-turno-dashboard").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.turno === turno);
  });

  const capacidade = 49;

  const valoresPorLinha = Object.entries(dadosOcupacaoLinhasDashboard)
    .map(([linha, t]) => {
      const valor = turno === "a" ? t.a : turno === "b" ? t.b : t.c;
      return [linha, valor];
    })
    .sort((a, b) => b[1] - a[1]);

  const totalGeral = valoresPorLinha.reduce((s, [, v]) => s + v, 0);
  const capacidadeTotal = capacidade * valoresPorLinha.length;
  const pctGeral =
    capacidadeTotal > 0
      ? Math.min(Math.round((totalGeral / capacidadeTotal) * 100), 100)
      : 0;
  const corGeral =
    pctGeral >= 90
      ? "#c0392b"
      : pctGeral >= 70
        ? "#e67e22"
        : "var(--verde-medio)";

  const cardsLinhas = valoresPorLinha
    .map(([linha, valor]) => {
      const pct = Math.min(Math.round((valor / capacidade) * 100), 100);
      const cor =
        pct >= 90 ? "#c0392b" : pct >= 70 ? "#e67e22" : "var(--verde-medio)";
      return `
      <div style="background:var(--cinza-claro);border-radius:var(--radius-sm);padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <span style="font-size:12px;color:var(--cinza-texto);">Linha ${linha}</span>
          <span style="font-size:12px;font-weight:700;color:${cor};">${pct}%</span>
        </div>
        <div style="font-size:22px;font-weight:700;color:${cor};margin-bottom:8px;">
          ${valor} <span style="font-size:12px;font-weight:400;color:var(--cinza-texto);">/ ${capacidade}</span>
        </div>
        <div style="width:100%;height:8px;background:var(--branco);border-radius:999px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${cor};border-radius:999px;transition:width 0.3s ease;"></div>
        </div>
      </div>`;
    })
    .join("");

  const cardTotal = `
    <div style="background:var(--verde-suave);border-radius:var(--radius-sm);padding:14px;border:1.5px solid var(--verde-medio);">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--verde-escuro);">TOTAL GERAL</span>
        <span style="font-size:12px;font-weight:700;color:${corGeral};">${pctGeral}%</span>
      </div>
      <div style="font-size:22px;font-weight:700;color:${corGeral};margin-bottom:8px;">
        ${totalGeral} <span style="font-size:12px;font-weight:400;color:var(--cinza-texto);">/ ${capacidadeTotal}</span>
      </div>
      <div style="width:100%;height:8px;background:var(--branco);border-radius:999px;overflow:hidden;">
        <div style="width:${pctGeral}%;height:100%;background:${corGeral};border-radius:999px;transition:width 0.3s ease;"></div>
      </div>
    </div>`;

  document.getElementById("dashboardOcupacaoLinhas").innerHTML =
    cardsLinhas + cardTotal ||
    `<p style="color:var(--cinza-texto);font-size:13px;">Nenhuma linha com ocupação.</p>`;
}

// ════════════════════════════════════════════════════════════════════════════
// INCLUIR
// ════════════════════════════════════════════════════════════════════════════
function abaIncluir(aba, el) {
  document
    .querySelectorAll("#tela-incluir .tab")
    .forEach((t) => t.classList.remove("ativa"));
  el.classList.add("ativa");
  document.getElementById("incluir-csv").style.display =
    aba === "csv" ? "block" : "none";
  document.getElementById("incluir-manual").style.display =
    aba === "manual" ? "block" : "none";
}

let dadosCSVIncluir = [];

function previewCSV() {
  const file = document.getElementById("csvIncluir").files[0];
  if (!file) return;
  document.getElementById("nomeArquivoIncluir").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const linhas = e.target.result.split("\n").filter((l) => l.trim());
    const cabecalho = linhas[0]
      .split(";")
      .map((c) => c.trim().toLowerCase().replace(/\r/g, ""));
    dadosCSVIncluir = linhas
      .slice(1)
      .map((linha) => {
        const cols = linha.split(";");
        const obj = {};
        cabecalho.forEach(
          (h, i) => (obj[h] = (cols[i] || "").trim().replace(/\r/g, "")),
        );
        return obj;
      })
      .filter((r) => r.matricula);
    status(
      "statusIncluir",
      `${dadosCSVIncluir.length} registros encontrados. Clique em Importar.`,
      "info",
    );
    document.getElementById("btnImportar").disabled = false;
  };
  reader.readAsText(file, "UTF-8");
}

async function importarCSV() {
  if (!dadosCSVIncluir.length) return;
  status("statusIncluir", "Importando...", "info");

  const registros = dadosCSVIncluir.map((r) => ({
    matricula: parseInt(r.matricula),
    nome_colaborador: r.nome || "", // ← lê coluna "nome" do CSV, salva em nome_colaborador
    tipo_de_logradouro: r.tipo_de_logradouro || "",
    logradouro: r.logradouro || "",
    numero: r.numero || "",
    bairro: r.bairro || "",
    municipio: r.municipio || "",
    estado: r.estado || "",
    jornada: r.jornada || "",
    codigo_centro_de_custo: r.codigo_centro_de_custo
      ? parseInt(r.codigo_centro_de_custo)
      : null,
    centro_de_custo: r.centro_de_custo || "",
    cargo: r.cargo || "",
  }));

  const matriculas = registros.map((r) => r.matricula);

  const { data: existentes } = await db
    .from("funcionarios")
    .select("matricula")
    .in("matricula", matriculas);
  const matriculasExistentes = new Set(
    (existentes || []).map((e) => e.matricula),
  );

  const duplicadosBanco = [];
  const errosImportacao = [];
  const registrosValidos = [];

  for (const r of registros) {
    if (matriculasExistentes.has(r.matricula)) {
      duplicadosBanco.push(r.matricula);
      continue;
    }
    if (!r.matricula) {
      errosImportacao.push({
        matricula: "SEM MATRÍCULA",
        motivo: "Matrícula inválida",
      });
      continue;
    }
    if (!r.nome_colaborador) {
      // ← CORRIGIDO: valida nome_colaborador (já mapeado de r.nome)
      errosImportacao.push({
        matricula: r.matricula,
        motivo: "Nome não informado",
      });
      continue;
    }
    if (!r.logradouro) {
      errosImportacao.push({
        matricula: r.matricula,
        motivo: "Logradouro não informado",
      });
      continue;
    }
    if (!r.bairro) {
      errosImportacao.push({
        matricula: r.matricula,
        motivo:
          "Bairro não informado (essencial para geocodificação precisa em Tupaciguara)",
      });
      continue;
    }
    if (!r.municipio) {
      errosImportacao.push({
        matricula: r.matricula,
        motivo: "Município não informado",
      });
      continue;
    }
    registrosValidos.push(r);
  }

  if (registrosValidos.length) {
    const { error } = await db.from("funcionarios").insert(registrosValidos);
    if (error) {
      status("statusIncluir", "Erro: " + error.message, "erro");
      return;
    }
  }

  const detalhesEl = document.getElementById("detalhesImportacao");
  if (detalhesEl) {
    detalhesEl.innerHTML = `
      <div class="card" style="margin-top:16px">
        <h4>Resumo da Importação</h4>
        <p>✅ ${registrosValidos.length} importados</p>
        <p>⚠️ ${duplicadosBanco.length} já existentes</p>
        <p>❌ ${errosImportacao.length} com erro</p>
        ${duplicadosBanco.length ? `<h5>Matrículas já existentes</h5><div>${duplicadosBanco.join(", ")}</div>` : ""}
        ${
          errosImportacao.length
            ? `<h5>Erros encontrados</h5><ul>${errosImportacao.map((e) => `<li>${e.matricula} - ${e.motivo}</li>`).join("")}</ul>`
            : ""
        }
      </div>`;
  }

  if (!registrosValidos.length) {
    status("statusIncluir", "Nenhum registro válido para importar.", "erro");
    return;
  }

  status(
    "statusIncluir",
    `${registrosValidos.length} importados. Geocodificando...`,
    "info",
  );

  const { data: semCoords } = await db
    .from("funcionarios")
    .select("*")
    .in("matricula", matriculas)
    .is("latitude", null);

  let geocodificados = 0;
  let falhas = 0;

  for (const c of semCoords ?? []) {
    await new Promise((r) => setTimeout(r, 300));

    const endereco = [
      c.tipo_de_logradouro,
      c.logradouro,
      c.numero,
      c.bairro,
      c.municipio,
      c.estado,
      "Brasil",
    ]
      .filter(Boolean)
      .join(", ");

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(endereco)}&key=${GOOGLE_KEY}`,
    );
    const data = await res.json();

    if (data.status !== "OK") {
      falhas++;
      continue;
    }

    const lat = data.results[0].geometry.location.lat;
    const lon = data.results[0].geometry.location.lng;

    await db
      .from("funcionarios")
      .update({ latitude: lat, longitude: lon })
      .eq("id", c.id);
    geocodificados++;
  }

  status(
    "statusIncluir",
    `${registrosValidos.length} importados — ${geocodificados} geocodificados${falhas ? `, ${falhas} sem endereço encontrado` : ""}.`,
    "ok",
  );

  dadosCSVIncluir = [];
  document.getElementById("btnImportar").disabled = true;
  carregarDashboard();
}

async function incluirManual() {
  const dados = {
    matricula: parseInt(document.getElementById("m_matricula").value),
    nome_colaborador: document.getElementById("m_nome").value.trim(),
    tipo_de_logradouro: document.getElementById("m_tipo").value.trim(),
    logradouro: document.getElementById("m_logradouro").value.trim(),
    numero: document.getElementById("m_numero").value.trim(),
    bairro: document.getElementById("m_bairro").value.trim(),
    municipio: document.getElementById("m_municipio").value.trim(),
    estado: document.getElementById("m_estado").value.trim(),
    jornada: document.getElementById("m_jornada").value.trim(),
    codigo_centro_de_custo: document
      .getElementById("m_codigo_centro_custo")
      .value.trim()
      ? parseInt(document.getElementById("m_codigo_centro_custo").value.trim())
      : null,
    centro_de_custo: document.getElementById("m_centro_custo").value.trim(),
    cargo: document.getElementById("m_cargo").value.trim(),
    latitude: window.latIncluir ? parseFloat(window.latIncluir) : null,
    longitude: window.lonIncluir ? parseFloat(window.lonIncluir) : null,
    rfid_id: document.getElementById("m_rfid").value.trim() || null,
  };

  if (!dados.matricula) {
    status("statusManual", "Matrícula obrigatória.", "erro");
    return;
  }
  if (!dados.bairro) {
    status(
      "statusManual",
      "Selecione um endereço válido (bairro é essencial para a alocação correta).",
      "erro",
    );
    return;
  }

  const { error } = await db
    .from("funcionarios")
    .upsert(dados, { onConflict: "matricula" });

  if (error) {
    status("statusManual", "Erro: " + error.message, "erro");
    return;
  }

  status("statusManual", "Colaborador incluído com sucesso!", "ok");

  // Limpa o formulário para o próximo cadastro
  document.getElementById("m_matricula").value = "";
  document.getElementById("m_nome").value = "";
  document.getElementById("m_jornada").value = "";
  document.getElementById("m_codigo_centro_custo").value = "";
  document.getElementById("m_centro_custo").value = "";
  document.getElementById("m_cargo").value = "";
  window.latIncluir = null;
  window.lonIncluir = null;
  document.getElementById("m_rfid").value = "";

  carregarDashboard();
}

function baixarModeloCSV() {
  const cabecalho = [
    "matricula",
    "nome",
    "tipo_de_logradouro",
    "logradouro",
    "numero",
    "bairro",
    "municipio",
    "estado",
    "jornada",
    "codigo_centro_de_custo",
    "centro_de_custo",
    "cargo",
  ];
  const linhaExemplo = [
    "1234",
    "JOAO DA SILVA",
    "RUA",
    "EXEMPLO DE NOME DA RUA",
    "100",
    "BAIRRO EXEMPLO",
    "TUPACIGUARA",
    "Minas Gerais",
    "07:00 - 17:00 Seg. a Qui. / 07:00 - 16:00 Sex.",
    "100",
    "PRODUCAO",
    "OPERADOR",
  ];
  const csv = [cabecalho.join(";"), linhaExemplo.join(";")].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "modelo_inclusao_colaboradores.csv";
  a.click();
}

// ════════════════════════════════════════════════════════════════════════════
// EXCLUIR
// ════════════════════════════════════════════════════════════════════════════
function abaExcluir(aba, el) {
  document
    .querySelectorAll("#tela-excluir .tab")
    .forEach((t) => t.classList.remove("ativa"));
  el.classList.add("ativa");
  document.getElementById("excluir-csv").style.display =
    aba === "csv" ? "block" : "none";
  document.getElementById("excluir-manual").style.display =
    aba === "manual" ? "block" : "none";
}

let matriculasExcluir = [];

function previewCSVExcluir() {
  const file = document.getElementById("csvExcluir").files[0];
  if (!file) return;
  document.getElementById("nomeArquivoExcluir").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const linhas = e.target.result.split("\n").filter((l) => l.trim());
    const cab = linhas[0]
      .split(";")
      .map((c) => c.trim().toLowerCase().replace(/\r/g, ""));
    const idxMatricula = cab.indexOf("matricula");
    matriculasExcluir = linhas
      .slice(1)
      .map((l) => parseInt(l.split(";")[idxMatricula]))
      .filter((m) => !isNaN(m));
    status(
      "statusExcluirCSV",
      `${matriculasExcluir.length} matrículas encontradas.`,
      "info",
    );
    document.getElementById("btnExcluirCSV").disabled = false;
  };
  reader.readAsText(file, "UTF-8");
}

async function excluirCSV() {
  if (!matriculasExcluir.length) return;
  if (
    !confirm(
      `Excluir ${matriculasExcluir.length} colaboradores? Esta ação não pode ser desfeita.`,
    )
  )
    return;
  const { error } = await db
    .from("funcionarios")
    .delete()
    .in("matricula", matriculasExcluir);
  if (error) {
    status("statusExcluirCSV", "Erro: " + error.message, "erro");
    return;
  }
  status(
    "statusExcluirCSV",
    `${matriculasExcluir.length} colaboradores excluídos.`,
    "ok",
  );
  matriculasExcluir = [];
  document.getElementById("btnExcluirCSV").disabled = true;
  carregarDashboard();
}

async function excluirManual() {
  const mat = parseInt(document.getElementById("excluirMatricula").value);
  if (!mat) {
    status("statusExcluirManual", "Informe a matrícula.", "erro");
    return;
  }

  const { data: func, error: errBusca } = await db
    .from("funcionarios")
    .select(
      "matricula, nome_colaborador, tipo_de_logradouro, logradouro, numero, bairro, jornada, cargo",
    )
    .eq("matricula", mat)
    .single();

  if (errBusca || !func) {
    status("statusExcluirManual", "Matrícula não encontrada.", "erro");
    return;
  }

  const confirmacao = confirm(
    `Confirma a exclusão deste colaborador?\n\n` +
      `Matrícula: ${func.matricula}\n` +
      `Nome: ${func.nome_colaborador ?? "—"}\n` +
      `Endereço: ${func.tipo_de_logradouro ?? ""} ${func.logradouro ?? ""}, ${func.numero ?? ""} - ${func.bairro ?? ""}\n` +
      `Jornada: ${func.jornada ?? "—"}\n` +
      `Cargo: ${func.cargo ?? "—"}\n\n` +
      `Esta ação não pode ser desfeita.`,
  );

  if (!confirmacao) return;

  const { error } = await db.from("funcionarios").delete().eq("matricula", mat);
  if (error) {
    status("statusExcluirManual", "Erro: " + error.message, "erro");
    return;
  }
  status("statusExcluirManual", "Colaborador excluído.", "ok");
  document.getElementById("excluirMatricula").value = "";
  carregarDashboard();
}

// ════════════════════════════════════════════════════════════════════════════
// EDITAR ALOCAÇÃO
// ════════════════════════════════════════════════════════════════════════════
let colaboradorEditarAtual = null;

async function buscarNomeEditar() {
  const termo = document.getElementById("editarBuscaNome").value.trim();
  const container = document.getElementById("editarSugestoesNome");

  if (termo.length < 2) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  const { data } = await db
    .from("funcionarios")
    .select("matricula, nome_colaborador")
    .ilike("nome_colaborador", `%${termo}%`)
    .order("nome_colaborador")
    .limit(10);

  if (!data?.length) {
    container.style.display = "none";
    return;
  }

  container.innerHTML = data
    .map(
      (f) => `
    <div onclick="selecionarNomeEditar(${f.matricula}, '${(f.nome_colaborador ?? "").replace(/'/g, "\\'")}')"
      style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--cinza-borda);"
      onmouseover="this.style.background='var(--verde-suave)'"
      onmouseout="this.style.background='var(--branco)'">
      <span style="font-weight:600;color:var(--verde-escuro);">${f.matricula}</span>
      <span style="color:var(--cinza-texto);margin-left:8px;">${f.nome_colaborador ?? "—"}</span>
    </div>
  `,
    )
    .join("");

  container.style.display = "block";
}

function selecionarNomeEditar(matricula, nome) {
  document.getElementById("editarMatricula").value = matricula;
  document.getElementById("editarBuscaNome").value = nome;
  document.getElementById("editarSugestoesNome").style.display = "none";
  buscarColaboradorEditar();
}

async function buscarColaboradorEditar() {
  const matricula = parseInt(document.getElementById("editarMatricula").value);
  if (!matricula) {
    status("statusEditar", "Digite uma matrícula.", "erro");
    return;
  }

  document.getElementById("editarNovoLat").value = "";
  document.getElementById("editarNovoLon").value = "";
  document.getElementById("editarNovoEndereco").value = "";
  document.getElementById("editarSugestaoPonto").style.display = "none";
  if (window.pacEditar) {
    window.pacEditar.value = "";
  }

  const { data: func, error } = await db
    .from("funcionarios")
    .select("*")
    .eq("matricula", matricula)
    .single();

  if (error || !func) {
    status("statusEditar", "Matrícula não encontrada.", "erro");
    document.getElementById("editarResultado").style.display = "none";
    return;
  }

  colaboradorEditarAtual = func;
  status("statusEditar", "Colaborador encontrado.", "ok");

  // Preenche cabeçalho
  document.getElementById("editarNome").textContent =
    func.nome_colaborador ?? `Matrícula ${func.matricula}`;

  // Preenche dados pessoais
  document.getElementById("editarNomeInput").value =
    func.nome_colaborador ?? "";
  document.getElementById("editarJornada").value = func.jornada ?? "";
  document.getElementById("editarCodigoCentroCusto").value =
    func.codigo_centro_de_custo ?? "";
  document.getElementById("editarCentroCusto").value =
    func.centro_de_custo ?? "";
  document.getElementById("editarCargo").value = func.cargo ?? "";
  document.getElementById("editarRfid").value = func.rfid_id ?? "";

  // Preenche endereço atual
  document.getElementById("editarEndereco").textContent =
    `${func.tipo_de_logradouro ?? ""} ${func.logradouro ?? ""}, ${func.numero ?? ""} - ${func.bairro ?? ""}`.trim();

  // Preenche status e datas
  document.getElementById("editarStatus").value = func.status ?? "ativo";
  document.getElementById("editarStatusInicio").value = formatarDataParaBR(
    func.status_inicio,
  );
  document.getElementById("editarStatusFim").value = formatarDataParaBR(
    func.status_fim,
  );
  toggleDatasEditar();

  // Aplica máscara nas datas
  aplicarMascaraData(document.getElementById("editarStatusInicio"));
  aplicarMascaraData(document.getElementById("editarStatusFim"));

  // Preenche select de pontos
  const { data: pontos } = await db
    .from("pontos")
    .select("*")
    .order("linha")
    .order("sequencia");
  const sel = document.getElementById("editarPontoSelect");
  sel.innerHTML = '<option value="">— Automático (algoritmo) —</option>';
  pontos?.forEach((p) => {
    const selecionado =
      func.ponto_fixo === p.nome && func.linha_fixa === p.linha
        ? "selected"
        : "";
    sel.innerHTML += `<option value="${p.nome}|${p.linha}" ${selecionado}>${p.nome} — Linha ${p.linha}</option>`;
  });

  document.getElementById("editarResultado").style.display = "block";
}

async function salvarEdicaoPonto() {
  if (!colaboradorEditarAtual) return;

  const valor = document.getElementById("editarPontoSelect").value;
  let pontoFixo = null,
    linhaFixa = null;
  if (valor) [pontoFixo, linhaFixa] = valor.split("|");

  const novoLat = document.getElementById("editarNovoLat").value;
  const novoLon = document.getElementById("editarNovoLon").value;
  const novoStatus = document.getElementById("editarStatus").value;
  const novoRfid = document.getElementById("editarRfid").value.trim() || null;

  // Verifica RFID duplicado antes de salvar
  if (novoRfid && novoRfid !== colaboradorEditarAtual.rfid_id) {
    const { data: rfidExistente } = await db
      .from("funcionarios")
      .select("matricula")
      .eq("rfid_id", novoRfid)
      .neq("matricula", colaboradorEditarAtual.matricula)
      .maybeSingle();

    if (rfidExistente) {
      status(
        "statusEditarSalvar",
        "Este RFID já está vinculado a outra matrícula.",
        "erro",
      );
      return;
    }
  }

  // ← dadosUpdate declarado UMA vez, antes de qualquer uso
  const dadosUpdate = {
    nome_colaborador: document.getElementById("editarNomeInput").value.trim(),
    jornada: document.getElementById("editarJornada").value.trim(),
    codigo_centro_de_custo: document
      .getElementById("editarCodigoCentroCusto")
      .value.trim()
      ? parseInt(
          document.getElementById("editarCodigoCentroCusto").value.trim(),
        )
      : null,
    centro_de_custo: document.getElementById("editarCentroCusto").value.trim(),
    cargo: document.getElementById("editarCargo").value.trim(),
    rfid_id: novoRfid,
    ponto_fixo: pontoFixo,
    linha_fixa: linhaFixa,
    status: novoStatus,
    status_inicio:
      novoStatus === "ferias" || novoStatus === "afastado"
        ? converterDataBR(document.getElementById("editarStatusInicio").value)
        : null,
    status_fim:
      novoStatus === "ferias" || novoStatus === "afastado"
        ? converterDataBR(document.getElementById("editarStatusFim").value)
        : null,
  };

  // ← Adiciona campos de endereço se novo endereço foi selecionado
  if (novoLat && novoLon) {
    dadosUpdate.latitude = parseFloat(novoLat);
    dadosUpdate.longitude = parseFloat(novoLon);
    dadosUpdate.tipo_de_logradouro =
      document.getElementById("editarNovoTipo").value;
    dadosUpdate.logradouro = document.getElementById(
      "editarNovoLogradouro",
    ).value;
    dadosUpdate.numero = document.getElementById("editarNovoNumero").value;
    dadosUpdate.bairro = document.getElementById("editarNovoBairro").value;
    dadosUpdate.municipio = document.getElementById(
      "editarNovoMunicipio",
    ).value;
    dadosUpdate.estado = document.getElementById("editarNovoEstado").value;
  }

  const { error } = await db
    .from("funcionarios")
    .update(dadosUpdate)
    .eq("id", colaboradorEditarAtual.id);

  if (error) {
    status("statusEditarSalvar", "Erro: " + error.message, "erro");
    return;
  }

  document.getElementById("editarNome").textContent =
    dadosUpdate.nome_colaborador ||
    `Matrícula ${colaboradorEditarAtual.matricula}`;

  status("statusEditarSalvar", "Alterações salvas com sucesso!", "ok");
  carregarDashboard();
}

function toggleDatasEditar() {
  const sel = document.getElementById("editarStatus").value;
  document.getElementById("editarDatas").style.display =
    sel === "ferias" || sel === "afastado" ? "block" : "none";
}

// ════════════════════════════════════════════════════════════════════════════
// STATUS / FÉRIAS / AFASTAMENTOS
// ════════════════════════════════════════════════════════════════════════════
let colaboradorStatusAtual = null;
let dadosCSVStatus = [];

function converterDataBR(dataBR) {
  if (!dataBR) return null;
  const partes = dataBR.trim().split("/");
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function formatarDataParaBR(dataISO) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function aplicarMascaraData(input) {
  input.addEventListener("input", () => {
    let valor = input.value.replace(/\D/g, "");
    if (valor.length > 8) valor = valor.slice(0, 8);
    if (valor.length >= 5) {
      valor = `${valor.slice(0, 2)}/${valor.slice(2, 4)}/${valor.slice(4)}`;
    } else if (valor.length >= 3) {
      valor = `${valor.slice(0, 2)}/${valor.slice(2)}`;
    }
    input.value = valor;
  });
}

async function atualizarStatusVencidos() {
  const hoje = new Date().toISOString().split("T")[0];

  // Férias/afastamentos que já terminaram → volta pra ativo
  await db
    .from("funcionarios")
    .update({ status: "ativo" }) // ← não limpa status_inicio e status_fim
    .lt("status_fim", hoje)
    .in("status", ["ferias", "afastado"]);

  // Férias/afastamentos que ainda não começaram → volta pra ativo
  await db
    .from("funcionarios")
    .update({ status: "ativo" })
    .gt("status_inicio", hoje)
    .in("status", ["ferias", "afastado"]);
}

function abaStatus(aba, el) {
  document
    .querySelectorAll("#tela-status .tab")
    .forEach((t) => t.classList.remove("ativa"));
  el.classList.add("ativa");
  document.getElementById("status-manual").style.display =
    aba === "manual" ? "block" : "none";
  document.getElementById("status-csv").style.display =
    aba === "csv" ? "block" : "none";
}

function toggleDatasStatus() {
  const sel = document.getElementById("statusSelect").value;
  document.getElementById("statusDatas").style.display =
    sel === "ferias" || sel === "afastado" ? "block" : "none";
}

async function buscarColaboradorStatus() {
  const matricula = parseInt(document.getElementById("statusMatricula").value);
  if (!matricula) {
    status("statusBuscaStatus", "Digite uma matrícula.", "erro");
    return;
  }

  const { data: func, error } = await db
    .from("funcionarios")
    .select("*")
    .eq("matricula", matricula)
    .single();

  if (error || !func) {
    status("statusBuscaStatus", "Matrícula não encontrada.", "erro");
    document.getElementById("statusResultado").style.display = "none";
    return;
  }

  colaboradorStatusAtual = func;
  status("statusBuscaStatus", "Colaborador encontrado.", "ok");

  document.getElementById("statusNome").textContent =
    func.nome_colaborador ?? `Matrícula ${func.matricula}`;
  document.getElementById("statusSelect").value =
    func.status === "ferias" || func.status === "afastado"
      ? func.status
      : "ferias";
  document.getElementById("statusInicio").value = formatarDataParaBR(
    func.status_inicio,
  );
  document.getElementById("statusFim").value = formatarDataParaBR(
    func.status_fim,
  );

  toggleDatasStatus();
  document.getElementById("statusResultado").style.display = "block";
}

async function salvarStatus() {
  if (!colaboradorStatusAtual) return;

  const novoStatus = document.getElementById("statusSelect").value;
  const inicio = document.getElementById("statusInicio").value;
  const fim = document.getElementById("statusFim").value;

  if (
    (novoStatus === "ferias" || novoStatus === "afastado") &&
    (!inicio || !fim)
  ) {
    status("statusSalvarStatus", "Preencha início e fim do período.", "erro");
    return;
  }

  const { error } = await db
    .from("funcionarios")
    .update({
      status: novoStatus,
      status_inicio: novoStatus === "ativo" ? null : converterDataBR(inicio),
      status_fim: novoStatus === "ativo" ? null : converterDataBR(fim),
    })
    .eq("id", colaboradorStatusAtual.id);

  if (error) {
    status("statusSalvarStatus", "Erro: " + error.message, "erro");
    return;
  }

  status("statusSalvarStatus", "Status atualizado com sucesso!", "ok");
  carregarListaStatus();
}

async function carregarListaStatus() {
  const hoje = new Date().toISOString().split("T")[0];

  const { data, error } = await db
    .from("funcionarios")
    .select(
      "matricula, nome_colaborador, status, status_inicio, status_fim, cargo, centro_de_custo",
    )
    .not("status_fim", "is", null)
    .gte("status_fim", hoje)
    .order("status_fim", { ascending: true });

  if (error || !data?.length) {
    document.getElementById("listaStatus").innerHTML =
      `<p style="color:var(--cinza-texto);font-size:13px;">Nenhuma programação de férias ou afastamento encontrada.</p>`;
    carregarNetFerias();
    return;
  }

  const hojeObj = new Date();
  hojeObj.setHours(0, 0, 0, 0);

  const labelStatus = { ferias: "Férias", afastado: "Afastado" };

  const registros = data.map((d) => {
    const inicio = d.status_inicio ? new Date(d.status_inicio) : null;
    const fim = d.status_fim ? new Date(d.status_fim) : null;

    let fase, badgeBg, badgeColor, badgeTexto;
    if (inicio && inicio > hojeObj) {
      fase = "futura";
      badgeBg = "#dbeafe";
      badgeColor = "#1d4ed8";
      badgeTexto = "🔵 Futura";
    } else {
      fase = "andamento";
      badgeBg = "#dcfce7";
      badgeColor = "#15803d";
      badgeTexto = "🟢 Em andamento";
    }
    return { ...d, fase, badgeBg, badgeColor, badgeTexto };
  });

  // Filtro ativo
  const filtroAtivo =
    document.getElementById("filtroFaseStatus")?.value ?? "todos";
  const filtrados =
    filtroAtivo === "todos"
      ? registros
      : registros.filter((r) => r.fase === filtroAtivo);

  // Contadores para os botões de filtro
  const contagens = {
    todos: registros.length,
    andamento: registros.filter((r) => r.fase === "andamento").length,
    futura: registros.filter((r) => r.fase === "futura").length,
    // finalizada: registros.filter((r) => r.fase === "finalizada").length,
  };

  document.getElementById("listaStatus").innerHTML = `
    <!-- Filtros -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      ${[
        { key: "todos", label: "Todos", cor: "var(--verde-escuro)" },
        { key: "andamento", label: "🟢 Em andamento", cor: "#15803d" },
        { key: "futura", label: "🔵 Futuras", cor: "#1d4ed8" },
        // { key: "finalizada", label: "⚫ Finalizadas", cor: "#64748b" },
      ]
        .map(
          ({ key, label, cor }) => `
        <button onclick="filtrarFaseStatus('${key}')"
          style="padding:6px 14px;border-radius:999px;border:2px solid ${filtroAtivo === key ? cor : "var(--cinza-borda)"};
            background:${filtroAtivo === key ? cor : "var(--branco)"};
            color:${filtroAtivo === key ? "#fff" : "var(--cinza-texto)"};
            cursor:pointer;font-size:12px;font-weight:600;">
          ${label} (${contagens[key]})
        </button>`,
        )
        .join("")}
    </div>

    <!-- Tabela -->
    ${
      filtrados.length
        ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Matrícula</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Nome</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Motivo</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Início</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Retorno</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Situação</th>
        </tr>
      </thead>
      <tbody>
        ${filtrados
          .map(
            (d) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--cinza-borda);">${d.matricula}</td>
            <td style="padding:8px;border-bottom:1px solid var(--cinza-borda);">${d.nome_colaborador ?? "—"}</td>
            <td style="padding:8px;border-bottom:1px solid var(--cinza-borda);">${labelStatus[d.status] ?? d.status}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);white-space:nowrap;">
              ${d.status_inicio ? formatarDataParaBR(d.status_inicio) : "—"}
            </td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);white-space:nowrap;">
              ${d.status_fim ? formatarDataParaBR(d.status_fim) : "—"}
            </td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);">
              <span style="background:${d.badgeBg};color:${d.badgeColor};padding:3px 10px;
                border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;">
                ${d.badgeTexto}
              </span>
            </td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
        : `<p style="color:var(--cinza-texto);font-size:13px;">Nenhum registro para o filtro selecionado.</p>`
    }`;

  carregarNetFerias();
}

function filtrarFaseStatus(fase) {
  const sel = document.getElementById("filtroFaseStatus");
  if (sel) sel.value = fase;
  carregarListaStatus();
}

function previewCSVStatus() {
  const file = document.getElementById("csvStatus").files[0];
  if (!file) return;
  document.getElementById("nomeArquivoStatus").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const linhas = e.target.result.split("\n").filter((l) => l.trim());
    const cabecalho = linhas[0]
      .split(";")
      .map((c) => c.trim().toLowerCase().replace(/\r/g, ""));
    dadosCSVStatus = linhas
      .slice(1)
      .map((linha) => {
        const cols = linha.split(";");
        const obj = {};
        cabecalho.forEach(
          (h, i) => (obj[h] = (cols[i] || "").trim().replace(/\r/g, "")),
        );
        return obj;
      })
      .filter((r) => r.matricula);
    status(
      "statusImportarStatus",
      `${dadosCSVStatus.length} registros encontrados.`,
      "info",
    );
    document.getElementById("btnImportarStatus").disabled = false;
  };
  reader.readAsText(file, "UTF-8");
}

async function importarCSVStatus() {
  if (!dadosCSVStatus.length) return;
  status("statusImportarStatus", "Importando...", "info");

  const motivosValidos = ["ferias", "afastamento"];
  let sucesso = 0,
    erros = 0;

  for (const r of dadosCSVStatus) {
    const matricula = parseInt(r.matricula);
    const motivo = r.motivo?.toLowerCase().trim();

    if (!motivosValidos.includes(motivo)) {
      erros++;
      continue;
    }

    const { error } = await db
      .from("funcionarios")
      .update({
        status: motivo === "ferias" ? "ferias" : "afastado",
        status_inicio: converterDataBR(r.data_saida),
        status_fim: converterDataBR(r.data_retorno),
      })
      .eq("matricula", matricula);

    if (error) erros++;
    else sucesso++;
  }

  status(
    "statusImportarStatus",
    `${sucesso} atualizados${erros ? `, ${erros} com erro` : ""}.`,
    "ok",
  );
  dadosCSVStatus = [];
  document.getElementById("btnImportarStatus").disabled = true;
  carregarListaStatus();
}

function baixarModeloStatusCSV() {
  const cabecalho = ["matricula", "motivo", "data_saida", "data_retorno"];
  const exemplo1 = ["1234", "ferias", "01/07/2026", "30/07/2026"];
  const exemplo2 = ["5678", "afastamento", "05/07/2026", "05/08/2026"];
  const csv = [
    cabecalho.join(";"),
    exemplo1.join(";"),
    exemplo2.join(";"),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "modelo_status_colaboradores.csv";
  a.click();
}

// ════════════════════════════════════════════════════════════════════════════
// CADASTRO RFID
// ════════════════════════════════════════════════════════════════════════════
async function vincularRfid() {
  const rfid = document.getElementById("rfidInput").value.trim();
  const matricula = parseInt(document.getElementById("rfidMatricula").value);

  if (!rfid || !matricula) {
    status("statusRfid", "Preencha o RFID e a matrícula.", "erro");
    return;
  }

  // ← Verifica se a matrícula existe em funcionarios
  const { data: func, error: errBusca } = await db
    .from("funcionarios")
    .select("matricula, nome_colaborador")
    .eq("matricula", matricula)
    .maybeSingle();

  if (errBusca || !func) {
    status(
      "statusRfid",
      `Matrícula ${matricula} não encontrada. Cadastre o colaborador antes de vincular o crachá.`,
      "erro",
    );
    return;
  }

  const { data: existente } = await db
    .from("funcionarios")
    .select("matricula")
    .eq("rfid_id", rfid)
    .neq("matricula", matricula)
    .maybeSingle();

  if (existente) {
    status(
      "statusRfid",
      "Este crachá já está vinculado a outra matrícula.",
      "erro",
    );
    return;
  }

  const { error } = await db
    .from("funcionarios")
    .update({ rfid_id: rfid })
    .eq("matricula", matricula);

  if (error) {
    status("statusRfid", "Erro: " + error.message, "erro");
    return;
  }

  status(
    "statusRfid",
    `Crachá vinculado a ${func.nome_colaborador ?? `matrícula ${matricula}`}!`,
    "ok",
  );
  document.getElementById("rfidInput").value = "";
  document.getElementById("rfidMatricula").value = "";
  document.getElementById("rfidInput").focus();
  carregarListaRfid();
}

async function carregarListaRfid() {
  const { data, error } = await db
    .from("funcionarios")
    .select("matricula, nome_colaborador, rfid_id")
    .not("rfid_id", "is", null)
    .order("matricula", { ascending: true });

  if (error || !data?.length) {
    document.getElementById("listaRfid").innerHTML =
      `<p style="color:var(--cinza-texto);font-size:13px;">Nenhum crachá cadastrado.</p>`;
    return;
  }

  document.getElementById("listaRfid").innerHTML = `
    <table style="width:100%;min-width:320px;border-collapse:collapse;">
      <thead><tr><th>Matrícula</th><th>Nome</th><th>RFID</th><th></th></tr></thead>
      <tbody>
        ${data
          .map(
            (r) => `
          <tr>
            <td>${r.matricula}</td>
            <td>${r.nome_colaborador ?? "—"}</td>
            <td style="word-break:break-all;">${r.rfid_id}</td>
            <td>
              <button onclick="excluirRfid(${r.matricula})"
                style="padding:4px 10px;border:1px solid var(--erro);border-radius:4px;background:var(--branco);color:var(--erro);cursor:pointer;font-size:12px;">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

async function excluirRfid(matricula) {
  if (!confirm("Remover este vínculo?")) return;
  await db
    .from("funcionarios")
    .update({ rfid_id: null })
    .eq("matricula", matricula);
  carregarListaRfid();
}

document.addEventListener("DOMContentLoaded", () => {
  const rfidEl = document.getElementById("rfidInput");
  const matriculaEl = document.getElementById("rfidMatricula");
  const statusInicioEl = document.getElementById("statusInicio");
  const statusFimEl = document.getElementById("statusFim");

  if (statusInicioEl) aplicarMascaraData(statusInicioEl);
  if (statusFimEl) aplicarMascaraData(statusFimEl);

  if (rfidEl) {
    rfidEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("rfidMatricula").focus();
      }
    });
  }

  if (matriculaEl) {
    matriculaEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        vincularRfid();
      }
    });
  }

  // ← ADICIONE AQUI, antes do });
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest("#editarBuscaNome") &&
      !e.target.closest("#editarSugestoesNome")
    ) {
      const container = document.getElementById("editarSugestoesNome");
      if (container) container.style.display = "none";
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ALGORITMO DE ALOCAÇÃO (núcleo do sistema)
// ════════════════════════════════════════════════════════════════════════════
function distancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function encontrarMelhorPontoBalanceado(lat, lon, pontos, ocupacaoLinhas) {
  let menorDist = Infinity;
  let nomePontoMaisProximo = null;

  for (const p of pontos) {
    const d = distancia(
      lat,
      lon,
      parseFloat(p.latitude),
      parseFloat(p.longitude),
    );
    if (d < menorDist) {
      menorDist = d;
      nomePontoMaisProximo = p.nome;
    }
  }

  const linhasNoPonto = pontos.filter((p) => p.nome === nomePontoMaisProximo);

  let escolhido = null;
  let menorOcupacao = Infinity;

  for (const p of linhasNoPonto) {
    const ocupacao = ocupacaoLinhas[p.linha] || 0;
    if (ocupacao < menorOcupacao) {
      menorOcupacao = ocupacao;
      escolhido = { ponto: p, distancia: menorDist };
    }
  }

  return escolhido;
}

function alocarColaborador(func, pontos, ocupacaoLinhas) {
  if (func.ponto_fixo && func.linha_fixa) {
    const pontoFixo = pontos.find(
      (p) => p.nome === func.ponto_fixo && p.linha === func.linha_fixa,
    );
    if (pontoFixo) {
      return { ponto: pontoFixo, distancia: 0 };
    }
  }
  return encontrarMelhorPontoBalanceado(
    parseFloat(func.latitude),
    parseFloat(func.longitude),
    pontos,
    ocupacaoLinhas,
  );
}

async function recalcularAlocacoes() {
  const { data: funcs } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .eq("status", "ativo")
    .order("matricula", { ascending: true }); // ← adicionado

  const { data: pontos } = await db.from("pontos").select("*");

  const ocupacaoLinhas = {};
  const atualizacoes = [];

  for (const f of funcs) {
    const resultado = alocarColaborador(f, pontos, ocupacaoLinhas);
    if (!resultado) continue;

    const linha = resultado.ponto.linha;
    ocupacaoLinhas[linha] = (ocupacaoLinhas[linha] || 0) + 1;

    atualizacoes.push({
      id: f.id,
      linha_alocada: linha,
      ponto_alocado: resultado.ponto.nome,
      distancia_ponto: Math.round(resultado.distancia * 1000),
    });
  }

  for (const item of atualizacoes) {
    await db
      .from("funcionarios")
      .update({
        linha_alocada: item.linha_alocada,
        ponto_alocado: item.ponto_alocado,
        distancia_ponto: item.distancia_ponto,
      })
      .eq("id", item.id);
  }

  console.table(ocupacaoLinhas);
  alert("Alocações recalculadas.");
}

// ════════════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE (Google Places) — inicializado pelo callback do script Maps
// ════════════════════════════════════════════════════════════════════════════
let latSelecionado = null,
  lonSelecionado = null;
let autocompleteNovoPonto = null;

window.initAutocomplete = async function () {
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Promise rejeitada:", e.reason);
  });
  // ── CONSULTA ──
  const containerConsulta = document.getElementById("autocomplete-container");
  if (containerConsulta) {
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");
    const pac = new PlaceAutocompleteElement({
      componentRestrictions: { country: "br" },
    });
    pac.style.width = "100%";
    pac.style.marginBottom = "12px";
    containerConsulta.appendChild(pac);

    pac.addEventListener("gmp-select", async (e) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ["location"] });
      latSelecionado = place.location.lat();
      lonSelecionado = place.location.lng();
    });
  }

  // ── INCLUIR ──
  const containerIncluir = document.getElementById("autocomplete-incluir");
  if (containerIncluir) {
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");
    const pacIncluir = new PlaceAutocompleteElement({
      componentRestrictions: { country: "br" },
    });
    pacIncluir.style.width = "100%";
    containerIncluir.appendChild(pacIncluir);

    pacIncluir.addEventListener("gmp-select", async (e) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents", "location"] });
      console.log("addressComponents:", place.addressComponents);
      console.log("formattedAddress:", place.formattedAddress);

      window.latIncluir = place.location.lat();
      window.lonIncluir = place.location.lng();

      const comps = place.addressComponents;
      const get = (tipos) =>
        comps?.find((c) => tipos.some((t) => c.types.includes(t)))?.longText ??
        "";

      const rua = get(["route"]);
      const partes = rua.split(" ");
      const tipo = partes[0];
      const nomeRua = partes.slice(1).join(" ");

      document.getElementById("m_tipo").value = tipo.toUpperCase();
      document.getElementById("m_logradouro").value = nomeRua;
      document.getElementById("m_numero").value = get(["street_number"]);
      document.getElementById("m_bairro").value = get([
        "sublocality_level_1",
        "sublocality",
        "neighborhood",
      ]);
      document.getElementById("m_cep").value = get(["postal_code"]);
      document.getElementById("m_municipio").value = get([
        "locality",
        "administrative_area_level_2",
      ]);
      document.getElementById("m_estado").value = get([
        "administrative_area_level_1",
      ]);
    });
  }

  // ── EDITAR ──
  const containerEditar = document.getElementById("autocomplete-editar");
  if (containerEditar) {
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");
    window.pacEditar = new PlaceAutocompleteElement({
      componentRestrictions: { country: "br" },
    });
    window.pacEditar.style.width = "100%";
    containerEditar.appendChild(window.pacEditar);

    window.pacEditar.addEventListener("gmp-select", async (e) => {
      const place = e.placePrediction.toPlace();
      // ← CORRIGIDO: inclui addressComponents no fetchFields
      await place.fetchFields({
        fields: ["addressComponents", "formattedAddress", "location"],
      });

      const lat = place.location.lat();
      const lon = place.location.lng();

      document.getElementById("editarNovoLat").value = lat;
      document.getElementById("editarNovoLon").value = lon;
      document.getElementById("editarNovoEndereco").value =
        place.formattedAddress ?? "";

      const comps = place.addressComponents;
      const get = (tipos) =>
        comps?.find((c) => tipos.some((t) => c.types.includes(t)))?.longText ??
        "";

      const rua = get(["route"]);
      const partes = rua.split(" ");
      document.getElementById("editarNovoTipo").value =
        partes[0]?.toUpperCase() ?? "";
      document.getElementById("editarNovoLogradouro").value = partes
        .slice(1)
        .join(" ");
      document.getElementById("editarNovoNumero").value = get([
        "street_number",
      ]);
      document.getElementById("editarNovoBairro").value = get([
        "sublocality_level_1",
        "sublocality",
        "neighborhood",
      ]);
      document.getElementById("editarNovoMunicipio").value = get([
        "locality",
        "administrative_area_level_2",
      ]);
      document.getElementById("editarNovoEstado").value = get([
        "administrative_area_level_1",
      ]);

      const { data: pontos } = await db.from("pontos").select("*");
      const sugestao = encontrarMelhorPontoBalanceado(lat, lon, pontos, {});

      if (sugestao?.ponto) {
        const sel = document.getElementById("editarPontoSelect");
        sel.value = `${sugestao.ponto.nome}|${sugestao.ponto.linha}`;
        document.getElementById("editarSugestaoPonto").style.display = "block";
        document.getElementById("editarSugestaoPonto").innerHTML =
          `📍 Sugestão automática: <strong>${sugestao.ponto.nome}</strong> — Linha ${sugestao.ponto.linha} (${(sugestao.distancia * 1000).toFixed(0)}m)`;
      }
    });
  }

  // ── NOVO PONTO (modal de Gestão de Rotas) ──
  // Inicializado sob demanda em abrirModalPonto()
};

// ════════════════════════════════════════════════════════════════════════════
// CONSULTAR PONTO
// ════════════════════════════════════════════════════════════════════════════
async function consultar() {
  const resultado = document.getElementById("resultado");

  if (!latSelecionado || !lonSelecionado) {
    resultado.innerHTML = `<div class="status-bar erro" style="display:block;">Selecione um endereço da lista de sugestões.</div>`;
    return;
  }

  resultado.innerHTML = `
    <div style="background:var(--branco);border-left:6px solid var(--verde-medio);border-radius:16px;padding:24px;box-shadow:var(--sombra);">
      <p>🔎 Procurando o ponto mais próximo...</p>
    </div>`;

  try {
    const { data: pontos, error } = await db.from("pontos").select("*");
    if (error) throw error;
    if (!pontos?.length) {
      resultado.innerHTML = "Nenhum ponto cadastrado.";
      return;
    }

    const resultadoPonto = encontrarMelhorPontoBalanceado(
      latSelecionado,
      lonSelecionado,
      pontos,
      {},
    );
    const melhor = resultadoPonto.ponto;
    const menor = resultadoPonto.distancia;

    const linhasNoMesmoPonto = pontos.filter((p) => p.nome === melhor.nome);
    const linkMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(melhor.endereco)}`;

    resultado.innerHTML = `
      <div style="background:var(--branco);border-left:6px solid var(--verde-escuro);border-radius:16px;padding:24px;box-shadow:var(--sombra);margin-bottom:16px;">
        <h3 style="color:var(--verde-escuro);font-size:22px;margin-bottom:8px;">📍 ${melhor.nome}</h3>
        <div style="color:#475569;margin-bottom:12px;line-height:1.5;">${melhor.endereco}</div>
        <div id="tempoCaminhada" style="font-size:16px;font-weight:600;color:#166534;margin-bottom:8px;">🚶 Calculando rota...</div>
        <a href="${linkMaps}" target="_blank" style="color:var(--verde-medio);font-weight:600;text-decoration:none;">
          Abrir no Google Maps →
        </a>
      </div>

      <div style="font-size:14px;font-weight:700;color:var(--verde-escuro);margin-bottom:12px;">
        ${linhasNoMesmoPonto.length > 1 ? `${linhasNoMesmoPonto.length} ônibus passam neste ponto:` : "Ônibus deste ponto:"}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
        ${linhasNoMesmoPonto
          .map(
            (p) => `
          <div style="background:${p.linha === melhor.linha ? "var(--verde-suave)" : "var(--branco)"};border:2px solid ${p.linha === melhor.linha ? "var(--verde-medio)" : "var(--cinza-borda)"};border-radius:12px;padding:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-size:16px;font-weight:700;color:var(--verde-escuro);"><i class="fa-solid fa-bus"></i> Linha ${p.linha}</span>
              ${p.linha === melhor.linha ? '<span style="font-size:10px;background:var(--dourado);color:var(--verde-escuro);padding:2px 8px;border-radius:999px;font-weight:700;">RECOMENDADO</span>' : ""}
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <tr>
                <th style="background:var(--verde-escuro);color:#fff;padding:6px;text-align:center;">A</th>
                <th style="background:var(--verde-escuro);color:#fff;padding:6px;text-align:center;">B</th>
                <th style="background:var(--verde-escuro);color:#fff;padding:6px;text-align:center;">C</th>
              </tr>
              <tr>
                <td style="padding:6px;text-align:center;background:#f8fafc;border:1px solid var(--cinza-borda);">${p.horario_a ?? "-"}</td>
                <td style="padding:6px;text-align:center;background:#f8fafc;border:1px solid var(--cinza-borda);">${p.horario_b ?? "-"}</td>
                <td style="padding:6px;text-align:center;background:#f8fafc;border:1px solid var(--cinza-borda);">${p.horario_c ?? "-"}</td>
              </tr>
            </table>
          </div>`,
          )
          .join("")}
      </div>`;

    const mapaEl = document.getElementById("mapa");
    mapaEl.style.display = "block";
    if (window.mapaGoogle) {
      window.mapaGoogle = null;
      mapaEl.innerHTML = "";
    }

    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const centro = {
      lat: (latSelecionado + parseFloat(melhor.latitude)) / 2,
      lng: (lonSelecionado + parseFloat(melhor.longitude)) / 2,
    };

    window.mapaGoogle = new Map(mapaEl, {
      center: centro,
      zoom: 14,
      mapId: "DEMO_MAP_ID",
    });

    const marcadorUsuario = document.createElement("div");
    marcadorUsuario.className = "marker-usuario";
    marcadorUsuario.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
    new AdvancedMarkerElement({
      map: window.mapaGoogle,
      position: { lat: latSelecionado, lng: lonSelecionado },
      title: "Seu endereço",
      content: marcadorUsuario,
    });

    const marcadorPonto = document.createElement("div");
    marcadorPonto.className = "marker-onibus";
    marcadorPonto.innerHTML = '<i class="fa-solid fa-bus"></i>';
    new AdvancedMarkerElement({
      map: window.mapaGoogle,
      position: {
        lat: parseFloat(melhor.latitude),
        lng: parseFloat(melhor.longitude),
      },
      title: melhor.nome,
      content: marcadorPonto,
    });

    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#0d5c3c", strokeWeight: 5 },
    });
    directionsRenderer.setMap(window.mapaGoogle);

    directionsService.route(
      {
        origin: { lat: latSelecionado, lng: lonSelecionado },
        destination: {
          lat: parseFloat(melhor.latitude),
          lng: parseFloat(melhor.longitude),
        },
        travelMode: google.maps.TravelMode.WALKING,
      },
      (result, dStatus) => {
        if (dStatus === "OK") {
          directionsRenderer.setDirections(result);
          const rota = result.routes[0].legs[0];
          const metros = rota.distance.value;
          const distanciaFormatada =
            metros < 1000
              ? `${metros} m`
              : `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
          document.getElementById("tempoCaminhada").innerHTML =
            `🚶 ${rota.duration.text} de caminhada &nbsp;&nbsp;•&nbsp;&nbsp; 📏 ${distanciaFormatada}`;
        }
      },
    );

    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: latSelecionado, lng: lonSelecionado });
    bounds.extend({
      lat: parseFloat(melhor.latitude),
      lng: parseFloat(melhor.longitude),
    });
    window.mapaGoogle.fitBounds(bounds, 60);
  } catch (err) {
    resultado.innerHTML = `Erro: ${err.message}`;
    console.error(err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RELATÓRIO DE PONTOS (persistido no Supabase)
// ════════════════════════════════════════════════════════════════════════════
let dadosRelatorio = [];

function capitalizarTexto(texto) {
  if (!texto) return texto;
  return texto
    .toLowerCase()
    .split(" ")
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(" ");
}

async function gerarRelatorio() {
  dadosRelatorio = [];
  status("statusRelatorio", "Verificando coordenadas...", "info");

  const { data: semCoords } = await db
    .from("funcionarios")
    .select("*")
    .is("latitude", null);

  if (semCoords?.length) {
    status(
      "statusRelatorio",
      `Geocodificando ${semCoords.length} colaboradores...`,
      "info",
    );
    for (const c of semCoords) {
      const endereco = [
        c.tipo_de_logradouro,
        c.logradouro,
        c.numero,
        c.bairro,
        c.municipio,
        c.estado,
        "Brasil",
      ]
        .filter(Boolean)
        .join(", ");
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(endereco)}&key=${GOOGLE_KEY}`,
      );
      const data = await res.json();
      if (data.status !== "OK") {
        console.warn(`Matrícula ${c.matricula} — ${data.status}`);
        continue;
      }
      const lat = data.results[0].geometry.location.lat;
      const lon = data.results[0].geometry.location.lng;
      await db
        .from("funcionarios")
        .update({ latitude: lat, longitude: lon })
        .eq("id", c.id);
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  status("statusRelatorio", "Carregando dados...", "info");

  const { data: funcs, error: e1 } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .order("matricula", { ascending: true });
  const { data: pontos, error: e2 } = await db.from("pontos").select("*");

  if (e1 || e2) {
    status("statusRelatorio", "Erro ao carregar dados.", "erro");
    return;
  }

  const ocupacaoLinhas = {};
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const labelStatus = {
    ativo: "Ativo",
    ferias: "Férias",
    afastado: "Afastado",
    desligado: "Desligado",
  };

  const total = funcs.length;

  for (let i = 0; i < funcs.length; i++) {
    const c = funcs[i];

    // Progresso
    const pct = Math.round(((i + 1) / total) * 100);
    status(
      "statusRelatorio",
      `Processando... ${i + 1} de ${total} (${pct}%)`,
      "info",
    );

    const resultadoPonto = alocarColaborador(c, pontos, ocupacaoLinhas);
    const melhor = resultadoPonto?.ponto;
    const menor = resultadoPonto?.distancia ?? 0;

    if (melhor)
      ocupacaoLinhas[melhor.linha] = (ocupacaoLinhas[melhor.linha] || 0) + 1;

    await db
      .from("funcionarios")
      .update({
        ponto_alocado: melhor?.nome ?? null,
        linha_alocada: melhor?.linha ?? null,
        distancia_ponto: Math.round(menor * 1000),
      })
      .eq("id", c.id);

    // ← Corrige status: só considera férias/afastado se já iniciou
    let statusReal = c.status ?? "ativo";
    if (statusReal === "ferias" || statusReal === "afastado") {
      const inicio = c.status_inicio ? new Date(c.status_inicio) : null;
      const fim = c.status_fim ? new Date(c.status_fim) : null;
      if (inicio && inicio > hoje) statusReal = "ativo"; // ainda não começou
      if (fim && fim < hoje) statusReal = "ativo"; // já terminou
    }

    dadosRelatorio.push({
      matricula: c.matricula,
      nome: capitalizarTexto(c.nome_colaborador) ?? "—",
      colaborador: capitalizarTexto(
        `${c.tipo_de_logradouro} ${c.logradouro}, ${c.numero} - ${c.bairro}`,
      ),
      jornada: c.jornada,
      status: labelStatus[statusReal] ?? statusReal,
      ponto: capitalizarTexto(melhor?.nome) ?? "-",
      ponto_endereco: melhor?.endereco ?? "-",
      ponto_lat: melhor?.latitude ?? "-",
      ponto_lon: melhor?.longitude ?? "-",
      linha: melhor?.linha ?? "-",
      distancia_m: Math.round(menor * 1000),
      horario_a: melhor?.horario_a ?? "-",
      horario_b: melhor?.horario_b ?? "-",
      horario_c: melhor?.horario_c ?? "-",
    });
  }

  dadosRelatorio.sort((a, b) => a.matricula - b.matricula);
  status(
    "statusRelatorio",
    `${dadosRelatorio.length} colaboradores processados.`,
    "ok",
  );

  renderTabelaRelatorio();

  await db.from("relatorio_pontos_cache").insert({ dados: dadosRelatorio });

  const { data: antigos } = await db
    .from("relatorio_pontos_cache")
    .select("id")
    .order("gerado_em", { ascending: false })
    .range(1, 100);

  if (antigos?.length) {
    await db
      .from("relatorio_pontos_cache")
      .delete()
      .in(
        "id",
        antigos.map((a) => a.id),
      );
  }

  atualizarDataGeracao(new Date());
}

function renderTabelaRelatorio() {
  document.getElementById("tabelaRelatorio").innerHTML = `
    <div class="tabela-wrap">
    <table>
      <thead><tr>
        <th style="width:9%;white-space:nowrap;">Matrícula</th>
        <th style="width:13%;">Nome</th>
        <th style="width:8%;">Status</th>
        <th style="width:16%;">Endereço</th>
        <th style="width:16%;">Jornada</th>
        <th style="width:11%;">Ponto</th>
        <th style="width:13%;">Endereço Ponto</th>
        <th style="width:8%;">Linha</th>
        <th style="width:8%;">Distância</th>
      </tr></thead>
      <tbody>
        ${dadosRelatorio
          .map((r) => {
            const corStatus =
              r.status === "Ativo"
                ? "var(--cinza-texto)"
                : r.status === "Férias"
                  ? "#1a6fa8"
                  : r.status === "Afastado"
                    ? "#b7950b"
                    : "var(--erro)";
            return `<tr>
              <td>${r.matricula}</td><td>${r.nome}</td>
              <td style="color:${corStatus};font-weight:600;">${r.status}</td>
              <td>${r.colaborador}</td><td>${r.jornada}</td>
              <td>${r.ponto}</td><td>${r.ponto_endereco}</td><td>${r.linha}</td>
              <td>${r.distancia_m} m</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;
}

function atualizarDataGeracao(data) {
  const el = document.getElementById("relatorioGeradoEm");
  if (!el) return;
  el.textContent = `Última atualização: ${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

async function carregarRelatorioSalvo() {
  const { data, error } = await db
    .from("relatorio_pontos_cache")
    .select("*")
    .order("gerado_em", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    document.getElementById("tabelaRelatorio").innerHTML =
      `<p style="color:var(--cinza-texto);font-size:14px;">Nenhum relatório gerado ainda. Clique em "Atualizar Relatório".</p>`;
    return;
  }

  dadosRelatorio = data.dados;
  renderTabelaRelatorio();
  atualizarDataGeracao(new Date(data.gerado_em));
}

function exportarCSV() {
  if (!dadosRelatorio.length) {
    alert("Gere o relatório primeiro.");
    return;
  }
  const cab = [
    "Matrícula",
    "Nome",
    "Status",
    "Endereço",
    "Jornada",
    "Ponto",
    "Endereço Ponto",
    "Linha",
    "Distância (m)",
  ];
  const linhas = dadosRelatorio.map((r) =>
    [
      r.matricula,
      `"${r.nome}"`,
      r.status,
      `"${r.colaborador}"`,
      `"${r.jornada}"`,
      `"${r.ponto}"`,
      `"${r.ponto_endereco}"`,
      r.linha,
      r.distancia_m,
    ].join(";"),
  );
  const csv = [cab.join(";"), ...linhas].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "relatorio_pontos.csv";
  a.click();
}

// function exportarListaPresenca() {
//   if (!dadosRelatorio.length) {
//     alert("Gere o relatório primeiro.");
//     return;
//   }

//   const turnoA = dadosRelatorio.filter((r) => {
//     const j = (r.jornada || "").toLowerCase();
//     return (
//       !j.includes("turno b") &&
//       !j.includes("b -") &&
//       !j.includes("turno c") &&
//       !j.includes("c -")
//     );
//   });

//   const porLinha = {};
//   for (const r of turnoA) {
//     if (!porLinha[r.linha]) porLinha[r.linha] = [];
//     porLinha[r.linha].push(r);
//   }

//   for (const [linha, colab] of Object.entries(porLinha).sort()) {
//     const linhasHTML = colab
//       .sort((a, b) => a.matricula - b.matricula)
//       .map(
//         (r) =>
//           `<tr><td>${r.matricula}</td><td>${r.ponto}</td><td style="text-align:center;font-size:18px;">☐</td></tr>`,
//       )
//       .join("");

//     const html = `
//       <html><head><meta charset="UTF-8">
//       <style>
//         body { font-family: Arial; padding: 30px; font-size: 13px; }
//         h2 { color: #1a4a2e; margin-bottom: 4px; }
//         .sub { color: #888; font-size: 12px; margin-bottom: 28px; }
//         table { width: 100%; border-collapse: collapse; }
//         th { background: #1a4a2e; color: #fff; padding: 8px 10px; text-align: left; }
//         td { padding: 7px 10px; border-bottom: 1px solid #e0e0e0; }
//         tr:nth-child(even) td { background: #f9f9f9; }
//       </style>
//       </head>
//       <body>
//         <h2>Lista de Presença — Turno A</h2>
//         <div class="sub">
//           Linha ${linha} &nbsp;•&nbsp; ${colab.length} colaboradores &nbsp;•&nbsp;
//           Gerado em ${new Date().toLocaleDateString("pt-BR")} &nbsp;•&nbsp; Bioenergética Aroeira
//         </div>
//         <table>
//           <thead><tr><th>Matrícula</th><th>Ponto de Embarque</th><th style="text-align:center;width:60px;">OK</th></tr></thead>
//           <tbody>${linhasHTML}</tbody>
//         </table>
//       </body></html>`;

//     const janela = window.open("", "_blank");
//     janela.document.write(html);
//     janela.document.close();
//     setTimeout(() => janela.print(), 500);
//   }
// }

// ════════════════════════════════════════════════════════════════════════════
// OCUPAÇÃO POR LINHA
// ════════════════════════════════════════════════════════════════════════════
async function carregarOcupacao() {
  status("statusOcupacao", "Calculando ocupação...", "info");
  const { data: funcs } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .eq("status", "ativo")
    .order("matricula", { ascending: true });
  const { data: pontos } = await db.from("pontos").select("*");
  if (!funcs || !pontos) {
    status("statusOcupacao", "Erro ao carregar dados.", "erro");
    return;
  }

  const linhas = {};
  const ocupacaoLinhas = {};

  for (const f of funcs) {
    const r = alocarColaborador(f, pontos, ocupacaoLinhas);
    const melhor = r?.ponto;
    if (!melhor) continue;

    const linha = melhor.linha;
    ocupacaoLinhas[linha] = (ocupacaoLinhas[linha] || 0) + 1;

    const ponto = melhor.nome;
    if (!linhas[linha])
      linhas[linha] = { a: 0, b: 0, c: 0, total: 0, pontos: {} };
    if (!linhas[linha].pontos[ponto]) {
      linhas[linha].pontos[ponto] = {
        sequencia: melhor.sequencia,
        a: 0,
        b: 0,
        c: 0,
        total: 0,
      };
    }

    linhas[linha].pontos[ponto].total++;

    const jornada = (f.jornada || "").toLowerCase();
    if (jornada.includes("turno b") || jornada.includes("b -")) {
      linhas[linha].b++;
      linhas[linha].pontos[ponto].b++;
    } else if (jornada.includes("turno c") || jornada.includes("c -")) {
      linhas[linha].c++;
      linhas[linha].pontos[ponto].c++;
    } else {
      linhas[linha].a++;
      linhas[linha].pontos[ponto].a++;
    }
    linhas[linha].total++;
  }

  document.getElementById("statusOcupacao").style.display = "none";
  document.getElementById("listaOcupacao").innerHTML = Object.entries(linhas)
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([linha, t]) => `
      <div class="linha-card">
        <div class="linha-header">
          <div class="linha-nome"><i class="fa-solid fa-bus"></i> Linha ${linha}</div>
          <div class="linha-badge">${t.total} colaboradores</div>
        </div>
        <div class="turnos-grid">
          <div class="turno-box"><div class="turno-label">Turno A</div><div class="turno-count">${t.a}</div><div class="turno-pessoas">colaboradores</div></div>
          <div class="turno-box"><div class="turno-label">Turno B</div><div class="turno-count">${t.b}</div><div class="turno-pessoas">colaboradores</div></div>
          <div class="turno-box"><div class="turno-label">Turno C</div><div class="turno-count">${t.c}</div><div class="turno-pessoas">colaboradores</div></div>
        </div>
        <div style="margin-top:16px;text-align:center;">
          <button id="btn-pontos-${linha}" class="btn-toggle-pontos" onclick="toggleLinha('${linha}')">
            <i class="fa-solid fa-chevron-down"></i> Ver pontos de embarque
          </button>
        </div>
        <div id="pontos-${linha}" class="pontos-linha" style="display:none;">
          ${Object.entries(t.pontos)
            .sort((a, b) => a[1].sequencia - b[1].sequencia)
            .map(
              ([nome, p]) => `
            <div class="ponto-item">
              <div class="ponto-header">
                <span class="ponto-nome">${p.sequencia}. ${nome}</span>
                <span class="ponto-total">${p.total}</span>
              </div>
              <div class="ponto-turnos">A: ${p.a} | B: ${p.b} | C: ${p.c}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>`,
    )
    .join("");
}

function toggleLinha(linha) {
  const el = document.getElementById(`pontos-${linha}`);
  const btn = document.getElementById(`btn-pontos-${linha}`);
  if (!el || !btn) return;

  if (el.style.display === "none") {
    el.style.display = "block";
    btn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Ocultar pontos de embarque`;
  } else {
    el.style.display = "none";
    btn.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Ver pontos de embarque`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// OCUPAÇÃO POR PONTO
// ════════════════════════════════════════════════════════════════════════════
async function carregarOcupacaoPonto() {
  status("statusOcupacaoPonto", "Calculando...", "info");

  const { data: funcs } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .eq("status", "ativo")
    .order("matricula", { ascending: true });
  const { data: pontos } = await db.from("pontos").select("*");

  if (!funcs || !pontos) {
    status("statusOcupacaoPonto", "Erro ao carregar dados.", "erro");
    return;
  }

  const ocupacaoLinhas = {};
  const dadosPontos = {};

  for (const f of funcs) {
    const resultadoPonto = alocarColaborador(f, pontos, ocupacaoLinhas);
    const melhor = resultadoPonto?.ponto;
    if (!melhor) continue;

    ocupacaoLinhas[melhor.linha] = (ocupacaoLinhas[melhor.linha] || 0) + 1;

    const key = `${melhor.linha}__${melhor.sequencia}__${melhor.nome}`;
    if (!dadosPontos[key]) {
      dadosPontos[key] = {
        nome: melhor.nome,
        linha: melhor.linha,
        sequencia: melhor.sequencia,
        a: 0,
        b: 0,
        c: 0,
        total: 0,
      };
    }

    dadosPontos[key].total++;
    const jornada = (f.jornada || "").toLowerCase();
    if (jornada.includes("turno b") || jornada.includes("b -"))
      dadosPontos[key].b++;
    else if (jornada.includes("turno c") || jornada.includes("c -"))
      dadosPontos[key].c++;
    else dadosPontos[key].a++;
  }

  document.getElementById("statusOcupacaoPonto").style.display = "none";

  const porLinha = {};
  for (const p of Object.values(dadosPontos)) {
    if (!porLinha[p.linha]) porLinha[p.linha] = [];
    porLinha[p.linha].push(p);
  }
  for (const linha in porLinha) {
    porLinha[linha].sort((a, b) => a.sequencia - b.sequencia);
  }

  window.dadosOcupacaoPonto = porLinha;
  renderOcupacaoPonto("todos");
}

function renderOcupacaoPonto(turno) {
  const porLinha = window.dadosOcupacaoPonto;
  if (!porLinha) return;

  const capacidade = 49;

  document.querySelectorAll(".btn-turno").forEach((b) => {
    b.style.background =
      b.dataset.turno === turno ? "var(--verde-escuro)" : "var(--verde-suave)";
    b.style.color = b.dataset.turno === turno ? "#fff" : "var(--verde-escuro)";
  });

  let html = "";

  for (const [linha, pontos] of Object.entries(porLinha).sort()) {
    html += `<div style="margin-bottom:32px;">
      <div style="font-size:16px;font-weight:700;color:var(--verde-escuro);margin-bottom:12px;">
        <i class="fa-solid fa-bus"></i> Linha ${linha}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">`;

    let acumulado = 0;

    for (const p of pontos) {
      const contagem =
        turno === "todos"
          ? p.total
          : turno === "a"
            ? p.a
            : turno === "b"
              ? p.b
              : p.c;
      acumulado += contagem;

      const pct = Math.min(Math.round((acumulado / capacidade) * 100), 100);
      const barras = Math.min(Math.round(pct / 10), 10);
      const cheias = "█".repeat(barras);
      const vazias = "░".repeat(10 - barras);
      const cor =
        pct >= 90 ? "#c0392b" : pct >= 70 ? "#e67e22" : "var(--verde-medio)";

      html += `
        <div style="background:var(--branco);border-radius:var(--radius);box-shadow:var(--sombra);padding:18px;">
          <div style="font-size:13px;font-weight:700;color:var(--verde-escuro);margin-bottom:2px;">${p.sequencia}. ${p.nome}</div>
          <div style="font-size:11px;color:var(--cinza-texto);margin-bottom:10px;">+${contagem} neste ponto</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <span style="font-size:20px;font-weight:700;color:${cor};">${acumulado} <span style="font-size:12px;font-weight:400;color:var(--cinza-texto);">/ ${capacidade}</span></span>
            <span style="font-size:14px;font-weight:600;color:${cor};">${pct}%</span>
          </div>
          <div style="font-size:16px;letter-spacing:2px;color:${cor};margin-bottom:8px;">${cheias}${vazias}</div>
          <div style="font-size:11px;color:var(--cinza-texto);">A: <strong>${p.a}</strong> &nbsp; B: <strong>${p.b}</strong> &nbsp; C: <strong>${p.c}</strong></div>
        </div>`;
    }

    html += `</div></div>`;
  }

  document.getElementById("listaOcupacaoPonto").innerHTML = html;
}

// ════════════════════════════════════════════════════════════════════════════
// GESTÃO DE ROTAS
// ════════════════════════════════════════════════════════════════════════════
let rotaPontosAtual = [];
let ocupacaoRotaAtual = {};

async function carregarLinhasRotas() {
  const { data } = await db.from("pontos").select("linha");
  if (!data) return;
  const linhas = [...new Set(data.map((p) => p.linha))].sort();
  const sel = document.getElementById("rotasLinha");
  sel.innerHTML = '<option value="">Selecione...</option>';
  linhas.forEach(
    (l) => (sel.innerHTML += `<option value="${l}">${l}</option>`),
  );
}

async function carregarRota() {
  const linha = document.getElementById("rotasLinha").value;
  if (!linha) return;

  const { data: pontos } = await db
    .from("pontos")
    .select("*")
    .eq("linha", linha)
    .order("sequencia", { ascending: true });

  rotaPontosAtual = pontos ? [...pontos] : [];
  await carregarOcupacaoRota(linha);
  renderListaRota();
  renderPreviewItinerario();
  carregarMapaRota();
}

function renderListaRota() {
  const el = document.getElementById("listaRotaPontos");
  if (!rotaPontosAtual.length) {
    el.innerHTML = `<p style="color:var(--cinza-texto);font-size:13px;">Nenhum ponto cadastrado.</p>`;
    return;
  }

  el.innerHTML = rotaPontosAtual
    .map(
      (p, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--cinza-borda);">
      <span style="font-size:13px;font-weight:700;color:var(--verde-escuro);min-width:24px;">${i + 1}.</span>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;">${p.nome}</div>
        <div style="font-size:11px;color:var(--cinza-texto);">${p.endereco ?? ""}</div>
      </div>
      <div style="display:flex;gap:4px;">
        <button onclick="moverPonto(${i}, -1)" ${i === 0 ? "disabled" : ""} style="padding:4px 8px;border:1px solid var(--cinza-borda);border-radius:4px;background:var(--branco);cursor:pointer;">↑</button>
        <button onclick="moverPonto(${i}, 1)" ${i === rotaPontosAtual.length - 1 ? "disabled" : ""} style="padding:4px 8px;border:1px solid var(--cinza-borda);border-radius:4px;background:var(--branco);cursor:pointer;">↓</button>
        <button onclick="removerPonto(${i})" style="padding:4px 8px;border:1px solid var(--erro);border-radius:4px;background:var(--branco);color:var(--erro);cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`,
    )
    .join("");
}

function moverPonto(idx, dir) {
  const novo = idx + dir;
  if (novo < 0 || novo >= rotaPontosAtual.length) return;
  [rotaPontosAtual[idx], rotaPontosAtual[novo]] = [
    rotaPontosAtual[novo],
    rotaPontosAtual[idx],
  ];
  renderListaRota();
  renderPreviewItinerario();
}

async function removerPonto(idx) {
  if (!confirm(`Remover "${rotaPontosAtual[idx].nome}" da rota?`)) return;

  const ponto = rotaPontosAtual[idx];

  if (ponto.id) {
    const { error } = await db.from("pontos").delete().eq("id", ponto.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
  }

  rotaPontosAtual.splice(idx, 1);
  renderListaRota();
  renderPreviewItinerario();
  status(
    "statusRotas",
    "Ponto removido. Clique em Salvar para atualizar sequências.",
    "ok",
  );
}

function renderPreviewItinerario() {
  const el = document.getElementById("previewItinerario");
  if (!rotaPontosAtual.length) {
    el.innerHTML = "";
    return;
  }

  const chegada = document.getElementById("rotasChegada").value;
  const velocidade =
    parseFloat(document.getElementById("rotasVelocidade").value) || 30;
  const [hC, mC] = chegada.split(":").map(Number);
  let totalMins = hC * 60 + mC;

  const rota = [
    ...rotaPontosAtual,
    { latitude: DESTINO_LAT, longitude: DESTINO_LON },
  ];
  const tempos = [];
  for (let i = 0; i < rota.length - 1; i++) {
    const d = distancia(
      parseFloat(rota[i].latitude),
      parseFloat(rota[i].longitude),
      parseFloat(rota[i + 1].latitude),
      parseFloat(rota[i + 1].longitude),
    );
    tempos.push(Math.round((d / velocidade) * 60) + 2);
  }

  const totalPercurso = tempos.reduce((a, b) => a + b, 0);
  let minAtual = totalMins - totalPercurso;

  // ← Calcula os totais de Pax por turno
  let totalA = 0,
    totalB = 0,
    totalC = 0;
  rotaPontosAtual.forEach((p) => {
    const oc = ocupacaoRotaAtual[p.nome] ?? { a: 0, b: 0, c: 0 };
    totalA += oc.a;
    totalB += oc.b;
    totalC += oc.c;
  });

  el.innerHTML = `
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr>
        <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Ponto</th>
        <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Turno A</th>
        <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Pax A</th>
        <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Turno B</th>
        <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Pax B</th>
        <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Turno C</th>
        <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Pax C</th>
      </tr>
    </thead>
    <tbody>
      ${rotaPontosAtual
        .map((p, i) => {
          const h = Math.floor((((minAtual % 1440) + 1440) % 1440) / 60);
          const m = (((minAtual % 1440) + 1440) % 1440) % 60;
          const horario = `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}min`;
          rotaPontosAtual[i]._horario_a = horario;
          minAtual += tempos[i];

          const oc = ocupacaoRotaAtual[p.nome] ?? { a: 0, b: 0, c: 0 };

          return `<tr>
          <td style="padding:8px;border-bottom:1px solid var(--cinza-borda);">${p.nome}</td>
          <td style="padding:8px;text-align:center;font-weight:700;color:var(--verde-escuro);border-bottom:1px solid var(--cinza-borda);">${horario}</td>
          <td style="padding:8px;text-align:center;color:var(--verde-medio);font-weight:600;border-bottom:1px solid var(--cinza-borda);">${oc.a}</td>
          <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);">${p.horario_b ?? "—"}</td>
          <td style="padding:8px;text-align:center;color:var(--cinza-texto);border-bottom:1px solid var(--cinza-borda);">${oc.b}</td>
          <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);">${p.horario_c ?? "—"}</td>
          <td style="padding:8px;text-align:center;color:var(--cinza-texto);border-bottom:1px solid var(--cinza-borda);">${oc.c}</td>
        </tr>`;
        })
        .join("")}
      <tr style="background:var(--verde-suave);font-weight:700;">
        <td style="padding:8px;">BIOENERGÉTICA AROEIRA</td>
        <td style="padding:8px;text-align:center;color:var(--verde-escuro);">${chegada}</td>
        <td style="padding:8px;text-align:center;color:var(--verde-escuro);">${totalA}</td>
        <td style="padding:8px;"></td>
        <td style="padding:8px;text-align:center;color:var(--verde-escuro);">${totalB}</td>
        <td style="padding:8px;"></td>
        <td style="padding:8px;text-align:center;color:var(--verde-escuro);">${totalC}</td>
      </tr>
    </tbody>
  </table>`;
}

async function salvarRota() {
  const linha = document.getElementById("rotasLinha").value;
  if (!linha || !rotaPontosAtual.length) {
    status("statusRotas", "Selecione uma linha.", "erro");
    return;
  }

  status("statusRotas", "Salvando...", "info");
  renderPreviewItinerario();

  for (let i = 0; i < rotaPontosAtual.length; i++) {
    const p = rotaPontosAtual[i];
    await db
      .from("pontos")
      .update({ sequencia: i + 1, horario_a: p._horario_a ?? p.horario_a })
      .eq("id", p.id);
  }

  status("statusRotas", "Rota salva e horários atualizados!", "ok");
  await carregarRota();
}

async function abrirModalPonto() {
  const linha = document.getElementById("rotasLinha").value;
  if (!linha) {
    status("statusRotas", "Selecione uma linha primeiro.", "erro");
    return;
  }

  document.getElementById("novoPontoNome").value = "";
  document.getElementById("novoPontoLat").value = "";
  document.getElementById("novoPontoLon").value = "";
  document.getElementById("novoPontoEndereco").value = "";

  const sel = document.getElementById("novoPontoPosicao");
  sel.innerHTML =
    rotaPontosAtual
      .map(
        (p, i) =>
          `<option value="${i + 1}">Antes de ${i + 1}. ${p.nome}</option>`,
      )
      .join("") +
    `<option value="${rotaPontosAtual.length + 1}">No final</option>`;

  const modal = document.getElementById("modalNovoPonto");
  modal.style.display = "flex";

  const container = document.getElementById("autocomplete-novoponto");
  if (!container.hasChildNodes()) {
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");
    autocompleteNovoPonto = new PlaceAutocompleteElement({
      componentRestrictions: { country: "br" },
    });
    autocompleteNovoPonto.style.width = "100%";
    container.appendChild(autocompleteNovoPonto);

    autocompleteNovoPonto.addEventListener("gmp-select", async (e) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      document.getElementById("novoPontoLat").value = place.location.lat();
      document.getElementById("novoPontoLon").value = place.location.lng();
      document.getElementById("novoPontoEndereco").value =
        place.formattedAddress ?? "";
    });
  }
}

function fecharModalPonto() {
  document.getElementById("modalNovoPonto").style.display = "none";
}

async function salvarNovoPonto() {
  const linha = document.getElementById("rotasLinha").value;
  const nome = document
    .getElementById("novoPontoNome")
    .value.trim()
    .toUpperCase();
  const lat = document.getElementById("novoPontoLat").value;
  const lon = document.getElementById("novoPontoLon").value;
  const endereco = document.getElementById("novoPontoEndereco").value;
  const posicao = parseInt(document.getElementById("novoPontoPosicao").value);

  if (!nome || !lat || !lon) {
    status(
      "statusNovoPonto",
      "Preencha o nome e selecione o endereço.",
      "erro",
    );
    return;
  }

  status("statusNovoPonto", "Salvando...", "info");

  const { data: novo, error } = await db
    .from("pontos")
    .insert({
      nome,
      endereco,
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      linha,
      sequencia: posicao,
      horario_a: null,
      horario_b: null,
      horario_c: null,
    })
    .select()
    .single();

  if (error) {
    status("statusNovoPonto", "Erro: " + error.message, "erro");
    return;
  }

  rotaPontosAtual.splice(posicao - 1, 0, novo);
  fecharModalPonto();
  renderListaRota();
  renderPreviewItinerario();
  status(
    "statusRotas",
    `Ponto "${nome}" adicionado. Clique em Salvar para confirmar.`,
    "ok",
  );
}

async function carregarOcupacaoRota(linha) {
  const { data: funcs } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .eq("status", "ativo")
    .order("matricula", { ascending: true });
  const { data: pontos } = await db.from("pontos").select("*");
  if (!funcs || !pontos) return;

  ocupacaoRotaAtual = {};
  const ocupacaoLinhas = {};

  for (const f of funcs) {
    const r = alocarColaborador(f, pontos, ocupacaoLinhas);
    const melhor = r?.ponto;
    if (!melhor) continue;

    ocupacaoLinhas[melhor.linha] = (ocupacaoLinhas[melhor.linha] || 0) + 1;

    if (melhor.linha !== linha) continue;

    const key = melhor.nome;
    if (!ocupacaoRotaAtual[key]) ocupacaoRotaAtual[key] = { a: 0, b: 0, c: 0 };

    const jornada = (f.jornada || "").toLowerCase();
    if (jornada.includes("turno b") || jornada.includes("b -"))
      ocupacaoRotaAtual[key].b++;
    else if (jornada.includes("turno c") || jornada.includes("c -"))
      ocupacaoRotaAtual[key].c++;
    else ocupacaoRotaAtual[key].a++;
  }
}

function exportarRotaExcel() {
  if (!rotaPontosAtual.length) {
    alert("Carregue uma rota primeiro.");
    return;
  }
  const linha = document.getElementById("rotasLinha").value;

  const cab = [
    "Seq.",
    "Ponto",
    "Endereço",
    "Turno A",
    "Pax A",
    "Turno B",
    "Pax B",
    "Turno C",
    "Pax C",
    "Total",
  ];
  const linhas = rotaPontosAtual.map((p, i) => {
    const oc = ocupacaoRotaAtual[p.nome] ?? { a: 0, b: 0, c: 0 };
    return [
      i + 1,
      `"${p.nome}"`,
      `"${p.endereco ?? ""}"`,
      p._horario_a ?? p.horario_a ?? "—",
      oc.a,
      p.horario_b ?? "—",
      oc.b,
      p.horario_c ?? "—",
      oc.c,
      oc.a + oc.b + oc.c,
    ].join(";");
  });

  const totalA = rotaPontosAtual.reduce(
    (s, p) => s + (ocupacaoRotaAtual[p.nome]?.a ?? 0),
    0,
  );
  const totalB = rotaPontosAtual.reduce(
    (s, p) => s + (ocupacaoRotaAtual[p.nome]?.b ?? 0),
    0,
  );
  const totalC = rotaPontosAtual.reduce(
    (s, p) => s + (ocupacaoRotaAtual[p.nome]?.c ?? 0),
    0,
  );
  linhas.push(
    `"—";"TOTAL";"";"";"";"";"${totalA}";"${totalB}";"${totalC}";"${totalA + totalB + totalC}"`,
  );

  const csv = [cab.join(";"), ...linhas].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `itinerario_${linha}.csv`;
  a.click();
}

function exportarRotaPDF() {
  if (!rotaPontosAtual.length) {
    alert("Carregue uma rota primeiro.");
    return;
  }
  const linha = document.getElementById("rotasLinha").value;
  const chegada = document.getElementById("rotasChegada").value;

  let totalA = 0,
    totalB = 0,
    totalC = 0;

  const linhasHTML = rotaPontosAtual
    .map((p, i) => {
      const oc = ocupacaoRotaAtual[p.nome] ?? { a: 0, b: 0, c: 0 };
      totalA += oc.a;
      totalB += oc.b;
      totalC += oc.c;
      return `
    <tr>
      <td>${i + 1}</td><td>${p.nome}</td><td>${p.endereco ?? ""}</td>
      <td>${p._horario_a ?? p.horario_a ?? "—"}</td><td style="text-align:center;">${oc.a}</td>
      <td>${p.horario_b ?? "—"}</td><td style="text-align:center;">${oc.b}</td>
      <td>${p.horario_c ?? "—"}</td><td style="text-align:center;">${oc.c}</td>
      <td style="text-align:center;font-weight:bold;">${oc.a + oc.b + oc.c}</td>
    </tr>`;
    })
    .join("");

  const html = `
    <html><head><meta charset="UTF-8">
    <style>
      body { font-family: Arial; padding: 30px; }
      h2 { color: #1a4a2e; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
      th { background: #1a4a2e; color: #fff; padding: 8px; text-align: left; }
      td { padding: 7px 8px; border-bottom: 1px solid #ddd; }
      .total-row { background: #e8f5ec; font-weight: bold; }
      .footer { margin-top: 20px; font-size: 12px; color: #888; }
    </style></head>
    <body>
      <h2>Itinerário — Linha ${linha}</h2>
      <p>Horário de chegada: <strong>${chegada}</strong></p>
      <table>
        <thead>
          <tr>
            <th>Seq.</th><th>Ponto</th><th>Endereço</th>
            <th>Turno A</th><th>Pax A</th><th>Turno B</th><th>Pax B</th><th>Turno C</th><th>Pax C</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${linhasHTML}
          <tr class="total-row">
            <td>—</td><td>BIOENERGÉTICA AROEIRA S.A.</td><td></td>
            <td>${chegada}</td><td style="text-align:center;">${totalA}</td>
            <td>—</td><td style="text-align:center;">${totalB}</td>
            <td>—</td><td style="text-align:center;">${totalC}</td>
            <td style="text-align:center;">${totalA + totalB + totalC}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">Gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
    </body></html>`;

  const janela = window.open("", "_blank");
  janela.document.write(html);
  janela.document.close();
  janela.print();
}

// ════════════════════════════════════════════════════════════════════════════
// MAPA DA ROTA (dentro de Gestão de Rotas)
// ════════════════════════════════════════════════════════════════════════════
let mapaRotaGoogle = null;
let marcadoresMapaRota = [];

async function carregarMapaRota() {
  const { Map } = await google.maps.importLibrary("maps");

  const mapaEl = document.getElementById("mapaRotaEl");
  if (!mapaEl) return;

  mapaRotaGoogle = new Map(mapaEl, {
    center: { lat: -18.595, lng: -48.7 },
    zoom: 13,
    mapId: "DEMO_MAP_ID",
  });

  filtrarMapaRota("a");
}

async function filtrarMapaRota(turno) {
  marcadoresMapaRota.forEach((m) => (m.map = null));
  marcadoresMapaRota = [];
  if (!mapaRotaGoogle || !rotaPontosAtual.length) return;

  document.querySelectorAll(".btn-turno-rota").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.turno === turno);
  });

  if (window.directionsRenderersRota) {
    window.directionsRenderersRota.forEach((r) => r.setMap(null));
  }
  window.directionsRenderersRota = [];

  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  const bounds = new google.maps.LatLngBounds();

  rotaPontosAtual.forEach((p, i) => {
    const oc = ocupacaoRotaAtual[p.nome] ?? { a: 0, b: 0, c: 0 };
    const valor =
      turno === "todos"
        ? oc.a + oc.b + oc.c
        : turno === "a"
          ? oc.a
          : turno === "b"
            ? oc.b
            : oc.c;
    const cor =
      valor >= 35
        ? "#c0392b"
        : valor >= 20
          ? "#e67e22"
          : valor > 0
            ? "#27ae60"
            : "#94a3b8";
    const tamanho = valor > 0 ? Math.max(32, Math.min(56, 24 + valor)) : 26;

    const marcador = document.createElement("div");
    marcador.style.cssText = `
      background:${cor}; color:#fff; border-radius:50%; width:${tamanho}px; height:${tamanho}px;
      display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;
      border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.3);
    `;
    marcador.textContent = `${valor}`;

    const adv = new AdvancedMarkerElement({
      map: mapaRotaGoogle,
      position: { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) },
      content: marcador,
      title: p.nome,
    });

    const turnoLabel =
      turno === "todos" ? "Total" : `Turno ${turno.toUpperCase()}`;
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="font-family:'Sora',sans-serif;padding:4px;">
          <strong>${i + 1}. ${p.nome}</strong><br>
          ${turnoLabel}: ${valor} colaboradores<br>
          ${turno === "todos" ? `A: ${oc.a} | B: ${oc.b} | C: ${oc.c}<br>` : ""}
          Horário A: ${p._horario_a ?? p.horario_a ?? "—"}
        </div>`,
    });

    adv.addListener("click", () => infoWindow.open(mapaRotaGoogle, adv));
    marcadoresMapaRota.push(adv);
    bounds.extend({
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
    });
  });

  bounds.extend({ lat: DESTINO_LAT, lng: DESTINO_LON });

  // Marcador da usina
  const marcadorUsina = document.createElement("div");
  marcadorUsina.style.cssText = `
    background:#1a4a2e; color:#fff; border-radius:50%; width:48px; height:48px;
    display:flex; align-items:center; justify-content:center;
    border:3px solid #c8a84b; box-shadow:0 3px 10px rgba(0,0,0,0.4);
  `;
  marcadorUsina.innerHTML =
    '<i class="fa-solid fa-industry" style="font-size:20px;"></i>';

  const advUsina = new AdvancedMarkerElement({
    map: mapaRotaGoogle,
    position: { lat: DESTINO_LAT, lng: DESTINO_LON },
    content: marcadorUsina,
    title: "Usina Bioenergética Aroeira S.A.",
  });

  const infoWindowUsina = new google.maps.InfoWindow({
    content: `
      <div style="font-family:'Sora',sans-serif;padding:4px;">
        <strong>Usina Bioenergética Aroeira S.A.</strong><br>
        Destino final da rota
      </div>`,
  });

  advUsina.addListener("click", () =>
    infoWindowUsina.open(mapaRotaGoogle, advUsina),
  );
  marcadoresMapaRota.push(advUsina);

  // ← CORRIGIDO: fitBounds chamado apenas uma vez
  if (rotaPontosAtual.length) {
    mapaRotaGoogle.fitBounds(bounds, 50);
  }

  const todosPontos = [
    ...rotaPontosAtual,
    { latitude: DESTINO_LAT, longitude: DESTINO_LON },
  ];
  const directionsService = new google.maps.DirectionsService();

  for (let i = 0; i < todosPontos.length - 1; i++) {
    const origem = {
      lat: parseFloat(todosPontos[i].latitude),
      lng: parseFloat(todosPontos[i].longitude),
    };
    const destino = {
      lat: parseFloat(todosPontos[i + 1].latitude),
      lng: parseFloat(todosPontos[i + 1].longitude),
    };

    const renderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#1a4a2e",
        strokeOpacity: 0.8,
        strokeWeight: 4,
      },
    });
    renderer.setMap(mapaRotaGoogle);
    window.directionsRenderersRota.push(renderer);

    directionsService.route(
      {
        origin: origem,
        destination: destino,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, dStatus) => {
        if (dStatus === "OK") renderer.setDirections(result);
      },
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAPA DE OCUPAÇÃO (tela própria)
// ════════════════════════════════════════════════════════════════════════════
let mapaOcupacaoGoogle = null;
let marcadoresMapaOcupacao = [];
let dadosPontosMapa = {};

async function carregarMapaOcupacao() {
  status("statusMapaOcupacao", "Calculando ocupação...", "info");

  const { data: funcs } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .eq("status", "ativo")
    .order("matricula", { ascending: true });
  const { data: pontos } = await db.from("pontos").select("*");

  if (!funcs || !pontos) {
    status("statusMapaOcupacao", "Erro ao carregar dados.", "erro");
    return;
  }

  const ocupacaoLinhas = {};
  dadosPontosMapa = {};

  for (const f of funcs) {
    const r = alocarColaborador(f, pontos, ocupacaoLinhas);
    const melhor = r?.ponto;
    if (!melhor) continue;

    ocupacaoLinhas[melhor.linha] = (ocupacaoLinhas[melhor.linha] || 0) + 1;

    const key = melhor.nome;
    if (!dadosPontosMapa[key]) {
      dadosPontosMapa[key] = {
        nome: melhor.nome,
        latitude: melhor.latitude,
        longitude: melhor.longitude,
        linhas: new Set(),
        a: 0,
        b: 0,
        c: 0,
        total: 0,
      };
    }
    dadosPontosMapa[key].linhas.add(melhor.linha);
    dadosPontosMapa[key].total++;

    const jornada = (f.jornada || "").toLowerCase();
    if (jornada.includes("turno b") || jornada.includes("b -"))
      dadosPontosMapa[key].b++;
    else if (jornada.includes("turno c") || jornada.includes("c -"))
      dadosPontosMapa[key].c++;
    else dadosPontosMapa[key].a++;
  }

  status(
    "statusMapaOcupacao",
    `${Object.keys(dadosPontosMapa).length} pontos mapeados.`,
    "ok",
  );

  const { Map } = await google.maps.importLibrary("maps");
  const mapaEl = document.getElementById("mapaOcupacaoEl");

  mapaOcupacaoGoogle = new Map(mapaEl, {
    center: { lat: -18.595, lng: -48.7 },
    zoom: 13,
    mapId: "DEMO_MAP_ID",
  });

  filtrarMapaOcupacao("todos");
}

async function filtrarMapaOcupacao(turno) {
  if (!mapaOcupacaoGoogle || !Object.keys(dadosPontosMapa).length) return;

  document.querySelectorAll(".btn-turno-mapa").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.turno === turno);
  });

  marcadoresMapaOcupacao.forEach((m) => (m.map = null));
  marcadoresMapaOcupacao = [];

  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  const bounds = new google.maps.LatLngBounds();

  Object.values(dadosPontosMapa).forEach((p) => {
    const valor =
      turno === "todos"
        ? p.total
        : turno === "a"
          ? p.a
          : turno === "b"
            ? p.b
            : p.c;
    if (valor === 0) return;

    const cor = valor >= 35 ? "#c0392b" : valor >= 20 ? "#e67e22" : "#27ae60";
    const tamanho = Math.max(32, Math.min(60, 24 + valor));

    const marcador = document.createElement("div");
    marcador.style.cssText = `
      background:${cor}; color:#fff; border-radius:50%; width:${tamanho}px; height:${tamanho}px;
      display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;
      border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.3);
    `;
    marcador.textContent = valor;

    const adv = new AdvancedMarkerElement({
      map: mapaOcupacaoGoogle,
      position: { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) },
      content: marcador,
      title: p.nome,
    });

    const turnoLabel =
      turno === "todos" ? "Total" : `Turno ${turno.toUpperCase()}`;
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="font-family:'Sora',sans-serif;padding:4px;">
          <strong>${p.nome}</strong><br>
          ${turnoLabel}: ${valor} colaboradores<br>
          ${turno === "todos" ? `A: ${p.a} | B: ${p.b} | C: ${p.c}<br>` : ""}
          Linhas: ${[...p.linhas].join(", ")}
        </div>`,
    });

    adv.addListener("click", () => infoWindow.open(mapaOcupacaoGoogle, adv));

    marcadoresMapaOcupacao.push(adv);
    bounds.extend({
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
    });
  });

  if (marcadoresMapaOcupacao.length) {
    mapaOcupacaoGoogle.fitBounds(bounds, 50);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CONFORMIDADE DE EMBARQUE
// ════════════════════════════════════════════════════════════════════════════
let dadosConformidade = [];

function formatarDataLocal(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function filtroRapido(tipo) {
  const hoje = new Date();
  let inicio = new Date(hoje);
  let fim = new Date(hoje);

  if (tipo === "ontem") {
    inicio.setDate(hoje.getDate() - 1);
    fim.setDate(hoje.getDate() - 1);
  } else if (tipo === "7dias") {
    inicio.setDate(hoje.getDate() - 6);
  } else if (tipo === "15dias") {
    inicio.setDate(hoje.getDate() - 14);
  } else if (tipo === "30dias") {
    inicio.setDate(hoje.getDate() - 29);
  }

  document.getElementById("conformidadeDataInicio").value =
    formatarDataLocal(inicio);
  document.getElementById("conformidadeDataFim").value = formatarDataLocal(fim);

  gerarConformidade();
}

async function gerarConformidade() {
  const MARGEM_TOLERANCIA_M = 100;
  const RAIO_USINA_M = 300;

  const dataInicio = document.getElementById("conformidadeDataInicio").value;
  const dataFim = document.getElementById("conformidadeDataFim").value;

  if (!dataInicio || !dataFim) {
    status("statusConformidade", "Selecione o período.", "erro");
    return;
  }

  status("statusConformidade", "Carregando dados...", "info");

  const inicioLocal = new Date(`${dataInicio}T00:00:00`);
  const fimLocal = new Date(`${dataFim}T23:59:59`);
  const inicioPeriodo = inicioLocal.toISOString();
  const fimPeriodo = fimLocal.toISOString();

  const { data: embarques, error: e1 } = await db
    .from("embarques")
    .select("*")
    .gte("hora", inicioPeriodo)
    .lte("hora", fimPeriodo);

  // ← CORRIGIDO: busca todos (não filtra por status=ativo) para reconhecer
  // colaboradores que embarcaram quando ativos mas hoje estão em outro status
  const { data: funcs, error: e2 } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .order("matricula", { ascending: true });

  const { data: pontos, error: e3 } = await db.from("pontos").select("*");

  if (e1 || e2 || e3) {
    status("statusConformidade", "Erro ao carregar dados.", "erro");
    return;
  }
  if (!embarques?.length) {
    dadosConformidade = [];
    status("statusConformidade", "Nenhum embarque nesse período.", "erro");
    renderTabelaConformidade();
    return;
  }

  const funcsPorMatricula = {};
  funcs.forEach((f) => (funcsPorMatricula[f.matricula] = f));

  dadosConformidade = [];
  const ocupacaoLinhas = {};

  // Para o cálculo de alocação usa só os ativos (igual ao sistema real)
  const funcsAtivos = funcs.filter((f) => f.status === "ativo");

  for (const e of embarques) {
    const func = funcsPorMatricula[e.matricula];

    let pontoAlocado = "—",
      linhaAlocada = "—",
      pontoAlocadoObj = null;
    if (func) {
      const r = alocarColaborador(func, pontos, ocupacaoLinhas);
      if (r?.ponto) {
        pontoAlocado = r.ponto.nome;
        linhaAlocada = r.ponto.linha;
        pontoAlocadoObj = r.ponto;
        ocupacaoLinhas[linhaAlocada] = (ocupacaoLinhas[linhaAlocada] || 0) + 1;
      }
    }

    if (e.latitude === null || e.longitude === null) {
      dadosConformidade.push({
        matricula: e.matricula,
        nome: func?.nome_colaborador ?? "—",
        endereco: func
          ? `${func.tipo_de_logradouro ?? ""} ${func.logradouro ?? ""}, ${func.numero ?? ""} - ${func.bairro ?? ""}`.trim()
          : "—",
        linha_embarque: e.linha,
        linha_alocada: linhaAlocada,
        ponto_alocado: pontoAlocado,
        ponto_real: "Sem GPS",
        ponto_real_lat: null,
        ponto_real_lon: null,
        distancia_m: null,
        distancia_esperado_m: null,
        data: new Date(e.hora).toLocaleDateString("pt-BR"),
        hora: new Date(e.hora).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        conforme: false,
        naUsina: false,
        statusTexto: "Sem GPS",
        statusCor: "var(--cinza-texto)",
        cargo: func?.cargo ?? "—",
        centro_de_custo: func?.centro_de_custo ?? "—",
      });
      continue;
    }

    let menorDist = Infinity,
      pontoReal = "—";
    for (const p of pontos) {
      const d = distancia(
        parseFloat(e.latitude),
        parseFloat(e.longitude),
        parseFloat(p.latitude),
        parseFloat(p.longitude),
      );
      if (d < menorDist) {
        menorDist = d;
        pontoReal = p.nome;
      }
    }

    let distanciaDoEsperado = null;
    if (pontoAlocadoObj) {
      distanciaDoEsperado =
        distancia(
          parseFloat(e.latitude),
          parseFloat(e.longitude),
          parseFloat(pontoAlocadoObj.latitude),
          parseFloat(pontoAlocadoObj.longitude),
        ) * 1000;
    }

    const conforme =
      distanciaDoEsperado !== null &&
      distanciaDoEsperado <= MARGEM_TOLERANCIA_M;

    const distUsina =
      distancia(
        parseFloat(e.latitude),
        parseFloat(e.longitude),
        DESTINO_LAT,
        DESTINO_LON,
      ) * 1000;
    const naUsina = distUsina <= RAIO_USINA_M;

    let pontoRealFinal = pontoReal;
    let statusTexto, statusCor;

    if (naUsina) {
      pontoRealFinal = "USINA BIOENERGÉTICA AROEIRA S.A.";
      statusTexto = "—";
      statusCor = "var(--cinza-texto)";
    } else if (conforme) {
      statusTexto = "OK";
      statusCor = "var(--sucesso)";
    } else {
      statusTexto = "Divergente";
      statusCor = "var(--erro)";
      pontoRealFinal = `${parseFloat(e.latitude).toFixed(6)}, ${parseFloat(e.longitude).toFixed(6)}`;
    }

    dadosConformidade.push({
      matricula: e.matricula,
      nome: func?.nome_colaborador ?? "—",
      endereco: func
        ? `${func.tipo_de_logradouro ?? ""} ${func.logradouro ?? ""}, ${func.numero ?? ""} - ${func.bairro ?? ""}`.trim()
        : "—",
      cargo: func?.cargo ?? "—",
      centro_de_custo: func?.centro_de_custo ?? "—",
      linha_embarque: e.linha,
      linha_alocada: linhaAlocada,
      ponto_alocado: pontoAlocado,
      ponto_real: pontoRealFinal,
      ponto_real_lat: e.latitude,
      ponto_real_lon: e.longitude,
      distancia_m: Math.round(menorDist * 1000),
      distancia_esperado_m:
        distanciaDoEsperado !== null ? Math.round(distanciaDoEsperado) : null,
      data: new Date(e.hora).toLocaleDateString("pt-BR"),
      hora: new Date(e.hora).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        cargo: func?.cargo ?? "—",
        centro_de_custo: func?.centro_de_custo ?? "—",
      }),
      conforme,
      naUsina,
      statusTexto,
      statusCor,
    });
  }

  dadosConformidade.sort((a, b) => {
    // Ordena por data (DD/MM/AAAA → converte para comparável)
    const [dA, mA, anoA] = a.data.split("/");
    const [dB, mB, anoB] = b.data.split("/");
    const dataA = new Date(`${anoA}-${mA}-${dA}`);
    const dataB = new Date(`${anoB}-${mB}-${dB}`);
    if (dataA - dataB !== 0) return dataA - dataB;

    // Depois por hora (HH:MM)
    return a.hora.localeCompare(b.hora);
  });

  const divergentes = dadosConformidade.filter(
    (d) => !d.conforme && !d.naUsina,
  ).length;
  status(
    "statusConformidade",
    `${dadosConformidade.length} embarques — ${divergentes} divergentes.`,
    divergentes > 0 ? "erro" : "ok",
  );

  renderTabelaConformidade();
}

function renderTabelaConformidade() {
  const soDivergentes = document.getElementById("filtroSoDivergentes")?.checked;
  const dados = soDivergentes
    ? dadosConformidade.filter((d) => !d.conforme && !d.naUsina)
    : dadosConformidade;

  if (!dados.length) {
    document.getElementById("tabelaConformidade").innerHTML =
      `<p style="color:var(--cinza-texto);font-size:14px;">Nenhum registro encontrado.</p>`;
    return;
  }

  document.getElementById("tabelaConformidade").innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:11%;white-space:nowrap;">Data</th>
          <th style="width:8%;white-space:nowrap;">Matrícula</th>
          <th style="width:14%;">Nome</th>
          <th style="width:7%;white-space:nowrap;">Hora</th>
          <th style="width:11%;white-space:nowrap;">Linha Embarque</th>
          <th style="width:11%;white-space:nowrap;">Linha Alocada</th>
          <th style="width:13%;">Ponto Alocado</th>
          <th style="width:18%;">Ponto Real</th>
          <th style="width:10%;white-space:nowrap;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${dados
          .map(
            (d) => `
          <tr style="${d.naUsina ? "background:#f5f5f5;" : !d.conforme ? "background:#fdecea;" : ""}">
            <td>${d.data}</td>
            <td>${d.matricula}</td>
            <td>${d.nome}</td>
            <td>${d.hora}</td>
            <td>${d.linha_embarque}</td>
            <td>${d.linha_alocada}</td>
            <td>${d.ponto_alocado}</td>
            <td>${
              !d.conforme && !d.naUsina
                ? `<a href="https://www.google.com/maps?q=${d.ponto_real}" target="_blank" style="color:var(--verde-medio);">${d.ponto_real} 🔗</a>`
                : d.ponto_real
            }</td>
            <td style="text-align:center;font-weight:700;color:${d.statusCor};">
              ${d.statusTexto}
            </td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function exportarConformidadeCSV() {
  if (!dadosConformidade.length) {
    alert("Gere o relatório primeiro.");
    return;
  }

  const soDivergentes = document.getElementById("filtroSoDivergentes")?.checked;
  const dados = soDivergentes
    ? dadosConformidade.filter((d) => !d.conforme && !d.naUsina)
    : dadosConformidade;

  const cab = [
    "Data",
    "Hora",
    "Matrícula",
    "Nome",
    "Cargo",
    "Centro de Custo",
    "Endereço",
    "Linha Embarque",
    "Linha Alocada",
    "Ponto Alocado",
    "Ponto Real",
    "Conforme",
    "Status",
  ];

  const linhas = dados.map((d) =>
    [
      d.data,
      d.hora,
      d.matricula,
      `"${d.nome}"`,
      `"${d.cargo ?? "—"}"`,
      `"${d.centro_de_custo ?? "—"}"`,
      `"${d.endereco ?? "—"}"`,
      d.linha_embarque,
      d.linha_alocada,
      `"${d.ponto_alocado}"`,
      `"${d.ponto_real}"`,
      d.conforme ? "Sim" : "Não",
      d.statusTexto,
    ].join(";"),
  );

  const csv = [cab.join(";"), ...linhas].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `conformidade_${document.getElementById("conformidadeDataInicio").value}_a_${document.getElementById("conformidadeDataFim").value}.csv`;
  a.click();
}
// ════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ════════════════════════════════════════════════════════════════════════════
function status(id, msg, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "status-bar " + tipo;
  el.style.display = "block";
}
async function carregarAlertasRetorno() {
  const hoje = new Date();
  const em7dias = new Date(hoje);
  em7dias.setDate(hoje.getDate() + 7);

  function ehTurnoA(jornada) {
    const j = (jornada || "").toLowerCase();
    return (
      !j.includes("turno b") &&
      !j.includes("b -") &&
      !j.includes("turno c") &&
      !j.includes("c -")
    );
  }

  // Busca quem está de férias/afastado e retorna nos próximos 7 dias (Turno A apenas)
  const { data: retornandoTodos } = await db
    .from("funcionarios")
    .select("*")
    .in("status", ["ferias", "afastado"])
    .gte("status_fim", hoje.toISOString().split("T")[0])
    .lte("status_fim", em7dias.toISOString().split("T")[0]);

  const retornando = (retornandoTodos ?? []).filter((f) => ehTurnoA(f.jornada));

  if (!retornando.length) {
    document.getElementById("statAlertasRetorno").textContent = "0";
    document.getElementById("listaAlertasRetorno").innerHTML =
      `<p style="color:var(--cinza-texto);font-size:13px;">Nenhum retorno previsto para os próximos 7 dias.</p>`;
    return;
  }

  // Pega a ocupação ATUAL de cada linha, SÓ TURNO A (igual ao Dashboard principal)
  const { data: ativosTodos } = await db
    .from("funcionarios")
    .select("*")
    .not("latitude", "is", null)
    .eq("status", "ativo")
    .order("matricula", { ascending: true });
  const { data: pontos } = await db.from("pontos").select("*");

  if (!ativosTodos || !pontos) return;

  const ativos = ativosTodos.filter((f) => ehTurnoA(f.jornada));

  const ocupacaoAtual = {};
  for (const f of ativos) {
    const r = alocarColaborador(f, pontos, ocupacaoAtual);
    if (!r?.ponto) continue;
    ocupacaoAtual[r.ponto.linha] = (ocupacaoAtual[r.ponto.linha] || 0) + 1;
  }

  // Para cada pessoa retornando (Turno A), simula onde seria alocada e o impacto
  const alertas = [];
  const ocupacaoSimulada = { ...ocupacaoAtual };

  for (const f of retornando) {
    if (!f.latitude || !f.longitude) continue;

    const r = alocarColaborador(f, pontos, ocupacaoSimulada);
    if (!r?.ponto) continue;

    const linha = r.ponto.linha;
    const ocupacaoAntes = ocupacaoSimulada[linha] || 0;
    ocupacaoSimulada[linha] = ocupacaoAntes + 1;

    if (ocupacaoSimulada[linha] > 49) {
      alertas.push({
        nome: f.nome_colaborador,
        matricula: f.matricula,
        linha,
        dataRetorno: f.status_fim,
        ocupacaoFinal: ocupacaoSimulada[linha],
        motivo: f.status === "ferias" ? "Férias" : "Afastamento",
      });
    }
  }

  // document.getElementById("statAlertasRetorno").textContent = alertas.length;

  if (!alertas.length) {
    document.getElementById("listaAlertasRetorno").innerHTML =
      `<p style="color:var(--sucesso);font-size:13px;">✓ Nenhum problema de superlotação previsto nos retornos dos próximos 7 dias (Turno A).</p>`;
    return;
  }

  document.getElementById("listaAlertasRetorno").innerHTML = alertas
    .sort((a, b) => new Date(a.dataRetorno) - new Date(b.dataRetorno))
    .map(
      (a) => `
      <div style="background:#fdecea;border-left:4px solid var(--erro);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:8px;">
        <div style="font-weight:700;color:var(--verde-escuro);font-size:13px;">
          ${a.nome ?? `Matrícula ${a.matricula}`} — ${a.motivo}
        </div>
        <div style="font-size:12px;color:var(--cinza-texto);margin-top:2px;">
          Retorna em ${formatarDataParaBR(a.dataRetorno)} → Linha ${a.linha} (Turno A) ficaria com <strong style="color:var(--erro);">${a.ocupacaoFinal}</strong> pessoas (acima de 49)
        </div>
      </div>`,
    )
    .join("");
}
// ════════════════════════════════════════════════════════════════════════════
// ESCALA FIM DE SEMANA — v4
// Substitui completamente o bloco FDS existente no app.js
// ════════════════════════════════════════════════════════════════════════════
const FDS_CHEGADA = "06:50";
const FDS_VELOCIDADE = 30;

let dadosCSVFds = [];
let escalasGeradas = [];

function baixarModeloCSVFds() {
  const cab = ["data", "matricula"];
  const exemplos = [
    ["28/06/2026", "1234"],
    ["28/06/2026", "5678"],
    ["29/06/2026", "1234"],
    ["29/06/2026", "9012"],
  ];
  const csv = [cab.join(";"), ...exemplos.map((l) => l.join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "modelo_escala_fds.csv";
  a.click();
}

function previewCSVFds() {
  const file = document.getElementById("csvFds").files[0];
  if (!file) return;
  document.getElementById("nomeArquivoFds").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const linhas = e.target.result.split("\n").filter((l) => l.trim());
    const cab = linhas[0]
      .split(";")
      .map((c) => c.trim().toLowerCase().replace(/\r/g, ""));
    dadosCSVFds = linhas
      .slice(1)
      .map((linha) => {
        const cols = linha.split(";");
        const obj = {};
        cab.forEach(
          (h, i) => (obj[h] = (cols[i] || "").trim().replace(/\r/g, "")),
        );
        return obj;
      })
      .filter((r) => r.matricula && r.data);

    const porData = {};
    dadosCSVFds.forEach((r) => {
      porData[r.data] = (porData[r.data] || 0) + 1;
    });
    const resumo = Object.entries(porData)
      .map(([d, n]) => `${d}: ${n}`)
      .join(" | ");

    document.getElementById("fdsPreviewCount").textContent =
      `${dadosCSVFds.length} registros — ${resumo}`;
    document.getElementById("fdsPreviewCount").style.display = "block";
    status(
      "statusFds",
      `${dadosCSVFds.length} registros prontos. Clique em Gerar.`,
      "info",
    );
  };
  reader.readAsText(file, "UTF-8");
}

function normalizarDataCSV(data) {
  if (!data) return null;
  if (data.includes("-")) return data;
  const partes = data.split("/");
  if (partes.length !== 3) return null;
  const [d, m, a] = partes;
  return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function ehTurnoFds(jornada, turno) {
  const j = (jornada || "").toLowerCase();
  const ehB = j.includes("turno b") || j.includes("b -");
  const ehC = j.includes("turno c") || j.includes("c -");
  if (turno === "b") return ehB;
  if (turno === "c") return ehC;
  return !ehB && !ehC;
}

function ordenarPontosRota(pontos) {
  if (pontos.length <= 1) return pontos;
  const comDist = pontos.map((p) => ({
    ...p,
    distUsina: distancia(
      parseFloat(p.latitude),
      parseFloat(p.longitude),
      DESTINO_LAT,
      DESTINO_LON,
    ),
  }));
  comDist.sort((a, b) => b.distUsina - a.distUsina);

  const ordenados = [comDist[0]];
  const restantes = comDist.slice(1);

  while (restantes.length) {
    const ultimo = ordenados[ordenados.length - 1];
    let menorDist = Infinity,
      idxMaisProximo = 0;
    restantes.forEach((p, i) => {
      const d = distancia(
        parseFloat(ultimo.latitude),
        parseFloat(ultimo.longitude),
        parseFloat(p.latitude),
        parseFloat(p.longitude),
      );
      if (d < menorDist) {
        menorDist = d;
        idxMaisProximo = i;
      }
    });
    ordenados.push(restantes[idxMaisProximo]);
    restantes.splice(idxMaisProximo, 1);
  }
  return ordenados;
}

function dividirEmOnibus(pontos, capacidadeMax) {
  const onibus = [];
  let onibusAtual = [];
  let pessoasNoOnibus = 0;
  for (const p of pontos) {
    if (pessoasNoOnibus + p.qtd > capacidadeMax && onibusAtual.length) {
      onibus.push(onibusAtual);
      onibusAtual = [];
      pessoasNoOnibus = 0;
    }
    onibusAtual.push(p);
    pessoasNoOnibus += p.qtd;
  }
  if (onibusAtual.length) onibus.push(onibusAtual);
  return onibus;
}

async function gerarEscalaFds() {
  if (!dadosCSVFds.length) {
    status("statusFds", "Carregue um arquivo CSV primeiro.", "erro");
    return;
  }

  status("statusFds", "Buscando colaboradores...", "info");

  const matriculas = [
    ...new Set(dadosCSVFds.map((r) => parseInt(r.matricula))),
  ];

  const { data: funcs, error } = await db
    .from("funcionarios")
    .select(
      "matricula, nome_colaborador, jornada, ponto_alocado, latitude, longitude",
    )
    .in("matricula", matriculas)
    .not("latitude", "is", null);

  if (error || !funcs?.length) {
    status(
      "statusFds",
      "Nenhum colaborador encontrado com coordenadas cadastradas.",
      "erro",
    );
    return;
  }

  const { data: pontosBanco } = await db.from("pontos").select("*");
  if (!pontosBanco) {
    status("statusFds", "Erro ao carregar pontos.", "erro");
    return;
  }

  const funcsPorMatricula = {};
  funcs.forEach((f) => (funcsPorMatricula[f.matricula] = f));
  const naoEncontrados = matriculas.filter((m) => !funcsPorMatricula[m]);

  // Agrupa por data normalizada — cada data vira uma escala separada
  const porData = {};
  for (const r of dadosCSVFds) {
    const dataNorm = normalizarDataCSV(r.data);
    if (!dataNorm) continue;
    if (!porData[dataNorm]) porData[dataNorm] = [];
    const func = funcsPorMatricula[parseInt(r.matricula)];
    if (func) porData[dataNorm].push(func);
  }

  escalasGeradas = [];

  for (const [data, colaboradores] of Object.entries(porData).sort()) {
    const porTurno = { a: [], b: [], c: [] };
    colaboradores.forEach((f) => {
      if (ehTurnoFds(f.jornada, "b")) porTurno.b.push(f);
      else if (ehTurnoFds(f.jornada, "c")) porTurno.c.push(f);
      else porTurno.a.push(f);
    });

    const turnosDaData = {};

    for (const [turno, pessoas] of Object.entries(porTurno)) {
      if (!pessoas.length) continue;

      const agrupamentoPonto = {};
      for (const f of pessoas) {
        const nomePonto = f.ponto_alocado || "SEM PONTO";
        if (!agrupamentoPonto[nomePonto]) {
          const pontoBanco = pontosBanco.find((p) => p.nome === nomePonto);
          agrupamentoPonto[nomePonto] = {
            nome: nomePonto,
            latitude: pontoBanco?.latitude ?? f.latitude,
            longitude: pontoBanco?.longitude ?? f.longitude,
            qtd: 0,
          };
        }
        agrupamentoPonto[nomePonto].qtd++;
      }

      const pontosOrdenados = ordenarPontosRota(
        Object.values(agrupamentoPonto),
      );
      const gruposOnibus = dividirEmOnibus(pontosOrdenados, 49);
      // Salva sem horário calculado — não precisamos mais
      turnosDaData[turno] = gruposOnibus;
    }

    escalasGeradas.push({
      data,
      turnosDaData,
      totalColaboradores: colaboradores.length,
    });

    // Salva cada data separadamente no banco
    await db.from("escalas_fds").insert({
      data_escala: data,
      turno: Object.keys(turnosDaData).join("+"),
      matriculas: colaboradores.map((f) => f.matricula),
      pontos_sugeridos: turnosDaData,
    });
  }

  status(
    "statusFds",
    `${escalasGeradas.length} data(s) processada(s).${naoEncontrados.length ? ` ${naoEncontrados.length} sem cadastro.` : ""}`,
    naoEncontrados.length ? "erro" : "ok",
  );

  renderEscalaFds(escalasGeradas, naoEncontrados);
  carregarHistoricoFds();
}

const TURNO_LABEL_FDS = { a: "Turno A", b: "Turno B", c: "Turno C" };

function renderEscalaFds(escalas, naoEncontrados = []) {
  const el = document.getElementById("fdsResultado");
  if (!escalas.length) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";

  popularSelectDatasFds();

  let html = "";

  for (const escala of escalas) {
    const dataLabel = new Date(escala.data + "T12:00:00").toLocaleDateString(
      "pt-BR",
      {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      },
    );

    html += `
      <div style="margin-bottom:32px;">
        <div style="display:flex;justify-content:space-between;align-items:center;
          margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--verde-suave);flex-wrap:wrap;gap:8px;">
          <div style="font-size:16px;font-weight:700;color:var(--verde-escuro);">
            ${dataLabel} — ${escala.totalColaboradores} colaboradores
          </div>
          <button onclick="copiarItinerarioFds('${escala.data}')"
            style="padding:6px 14px;border:1.5px solid var(--verde-medio);border-radius:var(--radius-sm);
              background:var(--branco);color:var(--verde-medio);cursor:pointer;font-size:12px;font-weight:600;
              display:flex;align-items:center;gap:6px;">
            <i class="fa-solid fa-copy"></i> Copiar itinerário
          </button>
        </div>`;

    for (const turno of ["a", "b", "c"]) {
      const onibuses = escala.turnosDaData[turno];
      if (!onibuses?.length) continue;

      const totalTurno = onibuses.reduce(
        (s, o) => s + o.reduce((ss, p) => ss + p.qtd, 0),
        0,
      );

      html += `
        <div style="margin-bottom:20px;">
          <div style="font-size:14px;font-weight:700;color:var(--verde-escuro);margin-bottom:12px;">
            ${TURNO_LABEL_FDS[turno]} — ${totalTurno} pessoas / ${onibuses.length} ônibus
          </div>`;

      onibuses.forEach((pontosOnibus, idxOnibus) => {
        const totalOnibus = pontosOnibus.reduce((s, p) => s + p.qtd, 0);
        html += `
          <div style="margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--cinza-texto);margin-bottom:6px;">
              Ônibus ${idxOnibus + 1} — ${totalOnibus} pessoas
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr>
                  <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Ponto</th>
                  <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Colaboradores</th>
                </tr>
              </thead>
              <tbody>
                ${pontosOnibus
                  .map(
                    (p) => `
                  <tr>
                    <td style="padding:8px;border-bottom:1px solid var(--cinza-borda);">${p.nome}</td>
                    <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);
                      font-weight:600;color:var(--verde-medio);">${p.qtd}</td>
                  </tr>`,
                  )
                  .join("")}
                <tr style="background:var(--verde-suave);font-weight:700;">
                  <td style="padding:8px;">BIOENERGÉTICA AROEIRA</td>
                  <td style="padding:8px;text-align:center;color:var(--verde-escuro);">${totalOnibus}</td>
                </tr>
              </tbody>
            </table>
          </div>`;
      });

      html += `</div>`;
    }

    html += `</div>`;
  }

  if (naoEncontrados.length) {
    html += `
      <div style="background:#fdecea;border-radius:var(--radius-sm);padding:12px;font-size:12px;color:var(--erro);">
        <strong>Matrículas sem cadastro ou sem endereço:</strong> ${naoEncontrados.join(", ")}
      </div>`;
  }

  document.getElementById("fdsItinerarios").innerHTML = html;
  document
    .getElementById("fdsResultado")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function copiarItinerarioFds(data) {
  const escala = escalasGeradas.find((e) => e.data === data);
  if (!escala) return;

  const dataLabel = new Date(data + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let texto = `*ITINERÁRIO FIM DE SEMANA*\n`;
  texto += `${dataLabel}\n`;
  texto += `${escala.totalColaboradores} colaboradores\n`;
  texto += `${"─".repeat(30)}\n`;

  for (const turno of ["a", "b", "c"]) {
    const onibuses = escala.turnosDaData[turno];
    if (!onibuses?.length) continue;

    const totalTurno = onibuses.reduce(
      (s, o) => s + o.reduce((ss, p) => ss + p.qtd, 0),
      0,
    );
    texto += `\n*${TURNO_LABEL_FDS[turno].toUpperCase()}* — ${totalTurno} colaboradores\n`;

    onibuses.forEach((pontosOnibus, idxOnibus) => {
      const totalOnibus = pontosOnibus.reduce((s, p) => s + p.qtd, 0);
      texto += `\n*Ônibus ${idxOnibus + 1}* (${totalOnibus} colaboradores)\n`;
      pontosOnibus.forEach((p) => {
        texto += `${p.nome} — ${p.qtd}\n`;
      });
    });
  }

  texto += `\n${"─".repeat(30)}\n`;
  texto += `_Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}_`;

  navigator.clipboard
    .writeText(texto)
    .then(() => {
      // Feedback visual temporário no botão
      const btn = document.querySelector(
        `[onclick="copiarItinerarioFds('${data}')"]`,
      );
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
        btn.style.borderColor = "var(--sucesso)";
        btn.style.color = "var(--sucesso)";
        setTimeout(() => {
          btn.innerHTML = original;
          btn.style.borderColor = "var(--verde-medio)";
          btn.style.color = "var(--verde-medio)";
        }, 2000);
      }
    })
    .catch(() => {
      alert(
        "Não foi possível copiar automaticamente. Selecione o texto manualmente.",
      );
    });
}

async function carregarHistoricoFds() {
  const { data, error } = await db
    .from("escalas_fds")
    .select("id, data_escala, turno, matriculas, pontos_sugeridos, criado_em")
    .order("data_escala", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(30);

  if (error || !data?.length) {
    document.getElementById("fdsHistorico").innerHTML =
      `<p style="color:var(--cinza-texto);font-size:13px;">Nenhuma escala registrada ainda.</p>`;
    return;
  }

  document.getElementById("fdsHistorico").innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Data</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Turnos</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);">Colaboradores</th>
          <th style="text-align:center;padding:8px;background:var(--verde-suave);color:var(--verde-escuro);"></th>
        </tr>
      </thead>
      <tbody>
        ${data
          .map(
            (e) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--cinza-borda);white-space:nowrap;">
              ${new Date(e.data_escala + "T12:00:00").toLocaleDateString(
                "pt-BR",
                {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                },
              )}
            </td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);">
              ${(e.turno ?? "").toUpperCase()}
            </td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);">
              ${e.matriculas?.length ?? 0}
            </td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid var(--cinza-borda);">
              <button onclick="recarregarEscalaFds(${e.id})"
                style="padding:4px 10px;border:1px solid var(--verde-medio);border-radius:4px;
                  background:var(--branco);color:var(--verde-medio);cursor:pointer;font-size:12px;">
                <i class="fa-solid fa-eye"></i> Ver
              </button>
            </td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

async function recarregarEscalaFds(id) {
  const { data, error } = await db
    .from("escalas_fds")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return;

  escalasGeradas = [
    {
      data: data.data_escala,
      turnosDaData: data.pontos_sugeridos ?? {},
      totalColaboradores: data.matriculas?.length ?? 0,
    },
  ];

  renderEscalaFds(escalasGeradas);
  document
    .getElementById("fdsResultado")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

async function adicionarAvulsoFds() {
  const matricula = parseInt(
    document.getElementById("fdsMatriculaAvulsa").value,
  );
  const data = document.getElementById("fdsDataAvulsa").value;

  if (!matricula) {
    status("statusFdsAvulso", "Informe a matrícula.", "erro");
    return;
  }
  if (!escalasGeradas.length || !data) {
    status("statusFdsAvulso", "Gere uma escala primeiro.", "erro");
    return;
  }

  status("statusFdsAvulso", "Buscando colaborador...", "info");

  const { data: func, error } = await db
    .from("funcionarios")
    .select(
      "matricula, nome_colaborador, jornada, ponto_alocado, latitude, longitude",
    )
    .eq("matricula", matricula)
    .not("latitude", "is", null)
    .maybeSingle();

  if (error || !func) {
    status(
      "statusFdsAvulso",
      "Matrícula não encontrada ou sem endereço.",
      "erro",
    );
    return;
  }
  if (!func.ponto_alocado) {
    status(
      "statusFdsAvulso",
      "Colaborador sem ponto alocado. Atualize o relatório de pontos primeiro.",
      "erro",
    );
    return;
  }

  const j = (func.jornada || "").toLowerCase();
  const turno =
    j.includes("turno b") || j.includes("b -")
      ? "b"
      : j.includes("turno c") || j.includes("c -")
        ? "c"
        : "a";

  const escalaIdx = escalasGeradas.findIndex((e) => e.data === data);
  if (escalaIdx === -1) {
    status("statusFdsAvulso", "Data não encontrada.", "erro");
    return;
  }

  const escala = escalasGeradas[escalaIdx];
  if (!escala.turnosDaData[turno]) escala.turnosDaData[turno] = [];

  const onibuses = escala.turnosDaData[turno];
  let alocado = false;

  for (const pontosOnibus of onibuses) {
    const totalOnibus = pontosOnibus.reduce((s, p) => s + p.qtd, 0);
    if (totalOnibus >= 49) continue;
    const pontoExistente = pontosOnibus.find(
      (p) => p.nome === func.ponto_alocado,
    );
    if (pontoExistente) {
      pontoExistente.qtd++;
      alocado = true;
      break;
    }
  }

  if (!alocado) {
    const { data: pontosBanco } = await db.from("pontos").select("*");
    const pontoBanco = pontosBanco?.find((p) => p.nome === func.ponto_alocado);
    const novoPonto = {
      nome: func.ponto_alocado,
      latitude: pontoBanco?.latitude ?? func.latitude,
      longitude: pontoBanco?.longitude ?? func.longitude,
      qtd: 1,
    };
    const ultimo = onibuses[onibuses.length - 1];
    const totalUltimo = ultimo ? ultimo.reduce((s, p) => s + p.qtd, 0) : 49;
    if (ultimo && totalUltimo < 49) ultimo.push(novoPonto);
    else onibuses.push([novoPonto]);
  }

  escala.totalColaboradores++;

  const { data: escalaBanco } = await db
    .from("escalas_fds")
    .select("id, matriculas")
    .eq("data_escala", data)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (escalaBanco) {
    await db
      .from("escalas_fds")
      .update({
        matriculas: [...(escalaBanco.matriculas ?? []), matricula],
        pontos_sugeridos: escala.turnosDaData,
      })
      .eq("id", escalaBanco.id);
  }

  document.getElementById("fdsMatriculaAvulsa").value = "";
  status(
    "statusFdsAvulso",
    `${func.nome_colaborador ?? matricula} adicionado — Turno ${turno.toUpperCase()}, ${func.ponto_alocado}.`,
    "ok",
  );

  renderEscalaFds(escalasGeradas);
}

function popularSelectDatasFds() {
  const sel = document.getElementById("fdsDataAvulsa");
  if (!sel || !escalasGeradas.length) return;
  sel.innerHTML = escalasGeradas
    .map((e) => {
      const label = new Date(e.data + "T12:00:00").toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      });
      return `<option value="${e.data}">${label}</option>`;
    })
    .join("");
}
async function carregarNetFerias() {
  const hoje = new Date();

  // Busca todos com datas preenchidas (em férias/afastado e histórico)
  const { data: ativos } = await db
    .from("funcionarios")
    .select("status_inicio, status_fim, jornada")
    .eq("status", "ativo")
    .not("status_fim", "is", null);

  const { data: ausentes } = await db
    .from("funcionarios")
    .select("status_inicio, status_fim, jornada")
    .in("status", ["ferias", "afastado"])
    .not("status_fim", "is", null);

  const todos = [...(ativos ?? []), ...(ausentes ?? [])];

  function turnoFunc(jornada) {
    const j = (jornada || "").toLowerCase();
    if (j.includes("turno b") || j.includes("b -")) return "b";
    if (j.includes("turno c") || j.includes("c -")) return "c";
    return "a";
  }

  // Gera 3 meses: atual + 2 próximos
  const meses = [0, 1, 2].map((offset) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
    return {
      ano: d.getFullYear(),
      mes: d.getMonth(),
      label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      saem: { a: 0, b: 0, c: 0 },
      voltam: { a: 0, b: 0, c: 0 },
    };
  });

  for (const f of todos) {
    if (!f.status_inicio || !f.status_fim) continue;
    const inicio = new Date(f.status_inicio);
    const fim = new Date(f.status_fim);
    const turno = turnoFunc(f.jornada);

    for (const m of meses) {
      const inicioMes = new Date(m.ano, m.mes, 1);
      const fimMes = new Date(m.ano, m.mes + 1, 0);
      if (inicio >= inicioMes && inicio <= fimMes) m.saem[turno]++;
      if (fim >= inicioMes && fim <= fimMes) m.voltam[turno]++;
    }
  }

  const netCalc = (saem, voltam) => saem - voltam;
  const corNet = (net) =>
    net < 0 ? "var(--erro)" : net > 0 ? "#15803d" : "var(--cinza-texto)";
  const icone = (net) => (net > 0 ? "▼" : net < 0 ? "▲" : "—");

  document.getElementById("cardNetFerias").innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
    ${meses
      .map(
        (m) => `
      <div style="background:var(--branco);border-radius:var(--radius-sm);padding:14px;box-shadow:var(--sombra);">
        <div style="font-size:12px;font-weight:700;color:var(--verde-escuro);margin-bottom:10px;
          text-transform:capitalize;">${m.label}</div>
        ${["a", "b", "c"]
          .map((t) => {
            const net = netCalc(m.saem[t], m.voltam[t]);
            return `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:5px 0;border-bottom:1px solid var(--cinza-borda);">
            <span style="font-size:11px;color:var(--cinza-texto);">Turno ${t.toUpperCase()}</span>
            <div style="text-align:right;">
              <span style="font-size:13px;font-weight:700;color:${corNet(net)};">
                ${icone(net)} ${Math.abs(net)}
              </span>
              <span style="font-size:10px;color:var(--cinza-texto);margin-left:6px;">
                ↓${m.saem[t]} ↑${m.voltam[t]}
              </span>
            </div>
          </div>`;
          })
          .join("")}
      </div>`,
      )
      .join("")}
  </div>`;
}
async function carregarEmbarquesReais() {
  const inputData = document.getElementById("filtroDataEmbarquesReais");

  // Garante que o input sempre tem um valor (default = hoje)
  if (!inputData.value) {
    inputData.value = new Date().toISOString().split("T")[0];
  }

  const data = inputData.value;
  const inicioISO = new Date(`${data}T00:00:00`).toISOString();
  const fimISO = new Date(`${data}T23:59:59`).toISOString();

  const { data: embarques, error } = await db
    .from("embarques")
    .select("linha, matricula")
    .gte("hora", inicioISO)
    .lte("hora", fimISO);

  const el = document.getElementById("dashboardEmbarquesReais");

  if (error) {
    el.innerHTML = `<p style="color:var(--erro);font-size:13px;">Erro ao carregar embarques.</p>`;
    return;
  }
  if (!embarques?.length) {
    el.innerHTML = `<p style="color:var(--cinza-texto);font-size:13px;">Nenhum embarque registrado nesta data.</p>`;
    return;
  }

  // Agrupa por linha — conta únicos por matrícula para evitar duplicatas
  const porLinha = {};
  const vistos = new Set();
  for (const e of embarques) {
    const chave = `${e.linha}_${e.matricula}`;
    if (vistos.has(chave)) continue; // ignora embarque duplicado da mesma matrícula no dia
    vistos.add(chave);
    porLinha[e.linha] = (porLinha[e.linha] || 0) + 1;
  }

  const capacidade = 49;
  const valoresPorLinha = Object.entries(porLinha).sort((a, b) => b[1] - a[1]);
  const totalGeral = valoresPorLinha.reduce((s, [, v]) => s + v, 0);
  const capacidadeTotal = capacidade * valoresPorLinha.length;
  const pctGeral =
    capacidadeTotal > 0
      ? Math.min(Math.round((totalGeral / capacidadeTotal) * 100), 100)
      : 0;
  const corGeral =
    pctGeral >= 90
      ? "#c0392b"
      : pctGeral >= 70
        ? "#e67e22"
        : "var(--verde-medio)";

  const cardsLinhas = valoresPorLinha
    .map(([linha, valor]) => {
      const pct = Math.min(Math.round((valor / capacidade) * 100), 100);
      const cor =
        pct >= 90 ? "#c0392b" : pct >= 70 ? "#e67e22" : "var(--verde-medio)";
      return `
      <div style="background:var(--cinza-claro);border-radius:var(--radius-sm);padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <span style="font-size:12px;color:var(--cinza-texto);">Linha ${linha}</span>
          <span style="font-size:12px;font-weight:700;color:${cor};">${pct}%</span>
        </div>
        <div style="font-size:22px;font-weight:700;color:${cor};margin-bottom:8px;">
          ${valor} <span style="font-size:12px;font-weight:400;color:var(--cinza-texto);">/ ${capacidade}</span>
        </div>
        <div style="width:100%;height:8px;background:var(--branco);border-radius:999px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${cor};border-radius:999px;transition:width 0.3s ease;"></div>
        </div>
      </div>`;
    })
    .join("");

  const cardTotal = `
    <div style="background:var(--verde-suave);border-radius:var(--radius-sm);padding:14px;border:1.5px solid var(--verde-medio);">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--verde-escuro);">TOTAL GERAL</span>
        <span style="font-size:12px;font-weight:700;color:${corGeral};">${pctGeral}%</span>
      </div>
      <div style="font-size:22px;font-weight:700;color:${corGeral};margin-bottom:8px;">
        ${totalGeral} <span style="font-size:12px;font-weight:400;color:var(--cinza-texto);">/ ${capacidadeTotal}</span>
      </div>
      <div style="width:100%;height:8px;background:var(--branco);border-radius:999px;overflow:hidden;">
        <div style="width:${pctGeral}%;height:100%;background:${corGeral};border-radius:999px;transition:width 0.3s ease;"></div>
      </div>
    </div>`;

  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
    ${cardsLinhas}${cardTotal}
  </div>`;
}
