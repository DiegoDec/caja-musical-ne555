"use strict";

let datos = [];
let graficaLagrange = null;
let graficaSpline = null;
let graficaBiseccion = null;
let splinesActuales = [];

const $ = (id) => document.getElementById(id);

function numero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (v === null || v === undefined || String(v).trim() === "") return NaN;

  let s = String(v).trim().replace(/\s/g, "");

  // Admite números decimales con coma, por ejemplo 1,25.
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");

  return Number(s);
}

function fmt(v, dec = 6) {
  if (!Number.isFinite(v)) return "No definido";
  return Number(v.toPrecision(dec)).toString();
}

function mensaje(id, texto, error = false) {
  const el = $(id);
  el.textContent = texto;
  el.classList.toggle("error", error);
}

function limpiarResultados() {
  ["resultadoLagrange", "resultadoSpline", "resultadoBiseccion",
   "polinomioLagrange", "polinomiosSpline"].forEach(id => {
    $(id).replaceChildren();
  });

  $("tablaIteraciones").innerHTML =
    '<tr><td colspan="6" class="empty">Aún no se ha ejecutado bisección.</td></tr>';

  destruirGrafica("graficaLagrange");
  destruirGrafica("graficaSpline");
  destruirGrafica("graficaBiseccion");
}

function destruirGrafica(id) {
  const mapa = {
    graficaLagrange: graficaLagrange,
    graficaSpline: graficaSpline,
    graficaBiseccion: graficaBiseccion
  };

  if (mapa[id]) mapa[id].destroy();

  if (id === "graficaLagrange") graficaLagrange = null;
  if (id === "graficaSpline") graficaSpline = null;
  if (id === "graficaBiseccion") graficaBiseccion = null;
}

function validarDatos(lista) {
  if (lista.length < 2) {
    throw new Error("Se necesitan al menos dos puntos numéricos.");
  }

  for (const p of lista) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error("Hay valores vacíos o no numéricos en el Excel.");
    }
  }

  lista.sort((a, b) => a.x - b.x);

  for (let i = 1; i < lista.length; i++) {
    if (lista[i].x === lista[i - 1].x) {
      throw new Error(
        "Hay tiempos repetidos. Cada tiempo debe ser único para estos cálculos."
      );
    }
  }

  return lista;
}

function detectarColumnas(fila) {
  const nombres = fila.map(v => String(v ?? "").trim().toLowerCase());

  const idxTiempo = nombres.findIndex(s =>
    /tiempo|time|segundo|seconds|seg\b|^t$/.test(s)
  );

  const idxFrecuencia = nombres.findIndex(s =>
    /frecuencia|frequency|freq|hz|hertz/.test(s)
  );

  if (idxTiempo >= 0 && idxFrecuencia >= 0 && idxTiempo !== idxFrecuencia) {
    return { idxTiempo, idxFrecuencia, hayEncabezado: true };
  }

  return { idxTiempo: 0, idxFrecuencia: 1, hayEncabezado: false };
}

$("cargarExcel").addEventListener("click", async () => {
  const archivo = $("archivoExcel").files[0];

  if (!archivo) {
    mensaje("estadoArchivo", "Selecciona un archivo Excel o CSV primero.", true);
    return;
  }

  if (typeof XLSX === "undefined") {
    mensaje(
      "estadoArchivo",
      "No se pudo cargar la librería Excel. Revisa tu conexión a internet.",
      true
    );
    return;
  }

  try {
    const extension = archivo.name.split(".").pop().toLowerCase();
    let libro;

    if (extension === "csv") {
      const texto = await archivo.text();
      libro = XLSX.read(texto, { type: "string" });
    } else {
      const buffer = await archivo.arrayBuffer();
      libro = XLSX.read(buffer, { type: "array" });
    }

    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, {
      header: 1,
      defval: ""
    });

    if (!filas.length) {
      throw new Error("La primera hoja del archivo está vacía.");
    }

    const columnas = detectarColumnas(filas[0]);
    const inicio = columnas.hayEncabezado ? 1 : 0;

    const nuevosDatos = [];

    for (let i = inicio; i < filas.length; i++) {
      const fila = filas[i];
      if (!fila || fila.length === 0) continue;

      const x = numero(fila[columnas.idxTiempo]);
      const y = numero(fila[columnas.idxFrecuencia]);

      // Ignorar filas completamente vacías.
      if (Number.isNaN(x) && Number.isNaN(y)) continue;

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(
          `La fila ${i + 1} no tiene un tiempo y una frecuencia válidos.`
        );
      }

      nuevosDatos.push({ x, y });
    }

    datos = validarDatos(nuevosDatos);
    limpiarResultados();
    mostrarDatos();
    prepararIntervalos();

    document.querySelectorAll(".method-card").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".method-panel").forEach(p => p.classList.add("hidden"));

    mensaje(
      "estadoArchivo",
      `Archivo "${archivo.name}" cargado correctamente. Se encontraron ${datos.length} puntos.`,
      false
    );
    $("estadoArchivo").classList.add("success");
  } catch (e) {
    datos = [];
    mostrarDatos();
    prepararIntervalos();
    $("resumenDatos").classList.add("hidden");
    mensaje("estadoArchivo", e.message || "No se pudo leer el archivo.", true);
  }
});

function mostrarDatos() {
  const cuerpo = $("cuerpoTabla");
  cuerpo.replaceChildren();

  if (!datos.length) {
    cuerpo.innerHTML =
      '<tr><td colspan="3" class="empty">Carga un archivo para ver los datos.</td></tr>';
    return;
  }

  datos.forEach((p, i) => {
    const tr = document.createElement("tr");
    [i + 1, fmt(p.x), fmt(p.y)].forEach(valor => {
      const td = document.createElement("td");
      td.textContent = valor;
      tr.appendChild(td);
    });
    cuerpo.appendChild(tr);
  });

  $("resumenDatos").classList.remove("hidden");
  $("cantidadPuntos").textContent = datos.length;
  $("tiempoMinimo").textContent = fmt(datos[0].x);
  $("tiempoMaximo").textContent = fmt(datos[datos.length - 1].x);
}

document.querySelectorAll(".method-card").forEach(boton => {
  boton.addEventListener("click", () => {
    if (!datos.length) {
      mensaje("estadoArchivo", "Primero debes cargar un Excel con tiempo y frecuencia.", true);
      return;
    }

    document.querySelectorAll(".method-card").forEach(b => b.classList.remove("active"));
    boton.classList.add("active");

    document.querySelectorAll(".method-panel").forEach(p => p.classList.add("hidden"));

    const panel = {
      lagrange: "panelLagrange",
      splines: "panelSplines",
      biseccion: "panelBiseccion"
    }[boton.dataset.metodo];

    $(panel).classList.remove("hidden");

    if (boton.dataset.metodo === "lagrange") ejecutarLagrange();
    if (boton.dataset.metodo === "splines") ejecutarSplines();
    if (boton.dataset.metodo === "biseccion") {
      construirSplines();
      dibujarGraficaBiseccion(null);
    }
  });
});

/* =========================
   LAGRANGE
========================= */

function lagrange(x) {
  let total = 0;

  for (let i = 0; i < datos.length; i++) {
    let termino = datos[i].y;

    for (let j = 0; j < datos.length; j++) {
      if (i !== j) {
        termino *= (x - datos[j].x) / (datos[i].x - datos[j].x);
      }
    }

    total += termino;
  }

  return total;
}

function mostrarPolinomioLagrange() {
  const contenedor = $("polinomioLagrange");
  contenedor.replaceChildren();

  const titulo = document.createElement("div");
  titulo.className = "formula-item";
  titulo.textContent = `P(x) = Σ yᵢ Lᵢ(x), con ${datos.length} puntos; grado máximo ${datos.length - 1}.`;
  contenedor.appendChild(titulo);

  datos.forEach((p, i) => {
    let factores = "";

    for (let j = 0; j < datos.length; j++) {
      if (i === j) continue;

      const otro = datos[j].x;
      factores += ` · (x − (${fmt(otro)}) ) / (${fmt(p.x)} − (${fmt(otro)}))`;
    }

    const item = document.createElement("div");
    item.className = "formula-item";
    item.textContent = `T${i}(x) = ${fmt(p.y)}${factores}`;
    contenedor.appendChild(item);
  });
}

function ejecutarLagrange() {
  if (!datos.length) return;

  mostrarPolinomioLagrange();

  const x = numero($("tiempoLagrange").value);

  if (Number.isFinite(x)) {
    const y = lagrange(x);
    mensaje(
      "resultadoLagrange",
      `Para el tiempo t = ${fmt(x)}, la frecuencia interpolada es f(t) ≈ ${fmt(y)}.`
    );
  } else {
    mensaje(
      "resultadoLagrange",
      "Ingresa un tiempo para estimar su frecuencia. El polinomio ya está construido."
    );
  }

  dibujarGraficaLagrange();
}

$("calcularLagrange").addEventListener("click", ejecutarLagrange);

function dibujarGraficaLagrange() {
  destruirGrafica("graficaLagrange");

  const xmin = datos[0].x;
  const xmax = datos[datos.length - 1].x;
  const curva = [];

  for (let i = 0; i <= 250; i++) {
    const x = xmin + (xmax - xmin) * i / 250;
    curva.push({ x, y: lagrange(x) });
  }

  graficaLagrange = new Chart($("graficaLagrange"), {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Polinomio de Lagrange",
          data: curva,
          showLine: true,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: "Datos experimentales",
          data: datos,
          pointRadius: 5,
          showLine: false
        }
      ]
    },
    options: opcionesGrafica("Tiempo", "Frecuencia")
  });
}

/* =========================
   SPLINES CÚBICOS NATURALES
========================= */

function construirSplines() {
  const n = datos.length;
  splinesActuales = [];

  if (n < 2) return;

  const h = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(datos[i + 1].x - datos[i].x);
  }

  const alpha = Array(n).fill(0);

  for (let i = 1; i < n - 1; i++) {
    alpha[i] =
      3 / h[i] * (datos[i + 1].y - datos[i].y) -
      3 / h[i - 1] * (datos[i].y - datos[i - 1].y);
  }

  const l = Array(n).fill(0);
  const mu = Array(n).fill(0);
  const z = Array(n).fill(0);
  const c = Array(n).fill(0);
  const b = Array(n - 1).fill(0);
  const d = Array(n - 1).fill(0);
  const a = datos.slice(0, n - 1).map(p => p.y);

  l[0] = 1;

  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (datos[i + 1].x - datos[i - 1].x) - h[i - 1] * mu[i - 1];

    if (l[i] === 0) throw new Error("No se pudo calcular el spline.");

    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  l[n - 1] = 1;
  c[n - 1] = 0;

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (datos[j + 1].y - datos[j].y) / h[j] -
      h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  for (let i = 0; i < n - 1; i++) {
    splinesActuales.push({
      x0: datos[i].x,
      x1: datos[i + 1].x,
      a: a[i],
      b: b[i],
      c: c[i],
      d: d[i]
    });
  }

  return splinesActuales;
}

function indiceSpline(x) {
  if (x < datos[0].x || x > datos[datos.length - 1].x) return -1;

  for (let i = 0; i < splinesActuales.length; i++) {
    if (x >= splinesActuales[i].x0 && x <= splinesActuales[i].x1) {
      return i;
    }
  }

  return -1;
}

function evaluarSplineEnTramo(s, x) {
  const dx = x - s.x0;
  return s.a + s.b * dx + s.c * dx * dx + s.d * dx * dx * dx;
}

function spline(x) {
  const i = indiceSpline(x);
  if (i < 0) throw new Error("El tiempo está fuera del rango de los datos.");

  return evaluarSplineEnTramo(splinesActuales[i], x);
}

function ejecutarSplines() {
  if (!datos.length) return;

  try {
    construirSplines();
    const contenedor = $("polinomiosSpline");
    contenedor.replaceChildren();

    splinesActuales.forEach((s, i) => {
      const item = document.createElement("div");
      item.className = "formula-item";
      item.textContent =
        `S${i + 1}(x), x ∈ [${fmt(s.x0)}, ${fmt(s.x1)}]: ` +
        `${fmt(s.a)} + (${fmt(s.b)})(x − ${fmt(s.x0)}) + ` +
        `(${fmt(s.c)})(x − ${fmt(s.x0)})² + ` +
        `(${fmt(s.d)})(x − ${fmt(s.x0)})³`;
      contenedor.appendChild(item);
    });

    const x = numero($("tiempoSpline").value);

    if (Number.isFinite(x)) {
      const y = spline(x);
      const i = indiceSpline(x);
      mensaje(
        "resultadoSpline",
        `Para t = ${fmt(x)}, la frecuencia estimada es f(t) ≈ ${fmt(y)}. ` +
        `Se utilizó el tramo S${i + 1}, entre ${fmt(splinesActuales[i].x0)} y ${fmt(splinesActuales[i].x1)}.`
      );
    } else {
      mensaje(
        "resultadoSpline",
        `Se calcularon ${splinesActuales.length} tramos cúbicos. Ingresa un tiempo para estimar la frecuencia.`
      );
    }

    dibujarGraficaSpline();
  } catch (e) {
    mensaje("resultadoSpline", e.message, true);
  }
}

$("calcularSpline").addEventListener("click", ejecutarSplines);

function dibujarGraficaSpline() {
  destruirGrafica("graficaSpline");

  const curva = [];

  splinesActuales.forEach(s => {
    const pasos = 60;
    for (let j = 0; j <= pasos; j++) {
      const x = s.x0 + (s.x1 - s.x0) * j / pasos;
      curva.push({ x, y: evaluarSplineEnTramo(s, x) });
    }
  });

  graficaSpline = new Chart($("graficaSpline"), {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Spline cúbico natural",
          data: curva,
          showLine: true,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: "Datos experimentales",
          data: datos,
          pointRadius: 5,
          showLine: false
        }
      ]
    },
    options: opcionesGrafica("Tiempo", "Frecuencia")
  });
}

/* =========================
   BISECCIÓN
========================= */

function prepararIntervalos() {
  const select = $("intervaloBiseccion");
  select.replaceChildren();

  if (datos.length < 2) {
    select.add(new Option("Carga primero los datos", ""));
    select.disabled = true;
    return;
  }

  for (let i = 0; i < datos.length - 1; i++) {
    const texto = `[${fmt(datos[i].x)}, ${fmt(datos[i + 1].x)}]`;
    select.add(new Option(texto, String(i)));
  }

  select.disabled = false;
}

function ejecutarBiseccion() {
  if (datos.length < 2) {
    mensaje("resultadoBiseccion", "Carga al menos dos puntos.", true);
    return;
  }

  const objetivo = numero($("frecuenciaObjetivo").value);
  const tolerancia = numero($("toleranciaBiseccion").value);
  const indice = Number($("intervaloBiseccion").value);

  if (!Number.isFinite(objetivo)) {
    mensaje("resultadoBiseccion", "Ingresa una frecuencia objetivo válida.", true);
    return;
  }

  if (!Number.isFinite(tolerancia) || tolerancia <= 0) {
    mensaje("resultadoBiseccion", "La tolerancia debe ser mayor que cero.", true);
    return;
  }

  if (!Number.isInteger(indice) || indice < 0 || indice >= datos.length - 1) {
    mensaje("resultadoBiseccion", "Selecciona un intervalo válido.", true);
    return;
  }

  try {
    construirSplines();

    const s = splinesActuales[indice];
    let a = s.x0;
    let b = s.x1;

    const g = x => evaluarSplineEnTramo(s, x) - objetivo;
    let fa = g(a);
    let fb = g(b);

    const filas = [];
    let raiz = null;

    if (Math.abs(fa) <= tolerancia) {
      raiz = a;
    } else if (Math.abs(fb) <= tolerancia) {
      raiz = b;
    } else if (fa * fb > 0) {
      mensaje(
        "resultadoBiseccion",
        `No hay cambio de signo en el intervalo seleccionado. ` +
        `g(a) = ${fmt(fa)} y g(b) = ${fmt(fb)}. ` +
        `Prueba otra frecuencia objetivo o selecciona otro intervalo.`,
        true
      );
      $("tablaIteraciones").innerHTML =
        '<tr><td colspan="6" class="empty">No se realizaron iteraciones porque el intervalo no encierra una raíz.</td></tr>';
      dibujarGraficaBiseccion(objetivo);
      return;
    }

    let iteracion = 0;
    const maxIteraciones = 500;

    while (raiz === null && iteracion < maxIteraciones) {
      iteracion++;

      const c = (a + b) / 2;
      const fc = g(c);
      const error = (b - a) / 2;

      filas.push([iteracion, a, b, c, fc, error]);

      if (Math.abs(fc) <= tolerancia || error <= tolerancia) {
        raiz = c;
        break;
      }

      if (fa * fc < 0) {
        b = c;
        fb = fc;
      } else {
        a = c;
        fa = fc;
      }
    }

    if (raiz === null) {
      mensaje("resultadoBiseccion", "Se alcanzó el máximo de iteraciones sin cumplir la tolerancia.", true);
    } else {
      mensaje(
        "resultadoBiseccion",
        `Tiempo aproximado: t ≈ ${fmt(raiz)}. ` +
        `Frecuencia objetivo: ${fmt(objetivo)}. ` +
        `Frecuencia estimada por el spline: ${fmt(spline(raiz))}. ` +
        `Iteraciones: ${iteracion}.`
      );
    }

    mostrarIteraciones(filas);
    dibujarGraficaBiseccion(objetivo, raiz);
  } catch (e) {
    mensaje("resultadoBiseccion", e.message, true);
  }
}

$("calcularBiseccion").addEventListener("click", ejecutarBiseccion);

function mostrarIteraciones(filas) {
  const tbody = $("tablaIteraciones");
  tbody.replaceChildren();

  if (!filas.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty">La raíz se encontró en un extremo del intervalo; no se necesitaron iteraciones.</td></tr>';
    return;
  }

  filas.forEach(fila => {
    const tr = document.createElement("tr");
    fila.forEach((valor, i) => {
      const td = document.createElement("td");
      td.textContent = i === 0 ? String(valor) : fmt(valor);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function dibujarGraficaBiseccion(objetivo, raiz = null) {
  destruirGrafica("graficaBiseccion");

  if (datos.length < 2) return;

  construirSplines();

  const curvas = [];
  splinesActuales.forEach(s => {
    for (let j = 0; j <= 50; j++) {
      const x = s.x0 + (s.x1 - s.x0) * j / 50;
      curvas.push({ x, y: evaluarSplineEnTramo(s, x) });
    }
  });

  const datasets = [
    {
      label: "Frecuencia estimada por splines",
      data: curvas,
      showLine: true,
      pointRadius: 0,
      borderWidth: 2
    },
    {
      label: "Datos experimentales",
      data: datos,
      showLine: false,
      pointRadius: 5
    }
  ];

  if (Number.isFinite(objetivo)) {
    datasets.push({
      label: "Frecuencia objetivo",
      data: [
        { x: datos[0].x, y: objetivo },
        { x: datos[datos.length - 1].x, y: objetivo }
      ],
      showLine: true,
      pointRadius: 0,
      borderDash: [6, 5],
      borderWidth: 2
    });
  }

  if (Number.isFinite(raiz)) {
    datasets.push({
      label: "Tiempo encontrado",
      data: [{ x: raiz, y: spline(raiz) }],
      showLine: false,
      pointRadius: 7
    });
  }

  graficaBiseccion = new Chart($("graficaBiseccion"), {
    type: "scatter",
    data: { datasets },
    options: opcionesGrafica("Tiempo", "Frecuencia")
  });
}

/* =========================
   CONFIGURACIÓN DE GRÁFICAS
========================= */

function opcionesGrafica(xLabel, yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "nearest",
      intersect: false
    },
    plugins: {
      legend: {
        position: "bottom"
      },
      tooltip: {
        callbacks: {
          label: ctx =>
            `(${fmt(ctx.parsed.x)}, ${fmt(ctx.parsed.y)})`
        }
      }
    },
    scales: {
      x: {
        type: "linear",
        title: {
          display: true,
          text: xLabel
        }
      },
      y: {
        title: {
          display: true,
          text: yLabel
        }
      }
    }
  };
}

/* Inicializar interfaz */
prepararIntervalos();