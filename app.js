"use strict";

const PLACEHOLDER_IMAGE = "img/placeholder.svg";
const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const grid = document.querySelector("#grilla-productos");
const searchInput = document.querySelector("#busqueda");
const availableOnly = document.querySelector("#solo-disponibles");
const sortSelect = document.querySelector("#ordenamiento");
const countLabel = document.querySelector("#resultado-conteo");
const emptyState = document.querySelector("#sin-resultados");
const loadError = document.querySelector("#error-carga");
const loadingState = document.querySelector("#estado-carga");
const dialog = document.querySelector("#modal-producto");
const mainPhoto = document.querySelector("#foto-principal");
const thumbnails = document.querySelector("#miniaturas");
const specsList = document.querySelector("#tabla-especificaciones");
let products = [];
let selectedCategory = "Todos";
let lastFocusedElement = null;

function formatPrice(value) {
  return value > 0 ? CLP.format(value) : "Precio por confirmar";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function renderOnlineReference(parent, product) {
  const reference = product.referencia_online;
  const referenceUrl = reference && safeExternalUrl(reference.url);
  if (!reference || !referenceUrl || product.precio <= 0 || !Number.isFinite(reference.precio_clp) || reference.precio_clp <= 0) {
    parent.replaceChildren();
    parent.classList.add("hidden");
    return;
  }

  const difference = reference.precio_clp - product.precio;
  const text = document.createElement("p");
  text.className = "text-xs leading-relaxed text-sky-900";
  text.textContent = `Referencia online ${reference.fuente}: ${formatPrice(reference.precio_clp)} (${reference.precio_original}). ${
    difference > 0
      ? `Ahorro aparente: ${formatPrice(difference)}.`
      : difference < 0
        ? `La referencia está ${formatPrice(Math.abs(difference))} bajo tu precio.`
        : "Mismo valor que tu precio."
  } ${reference.detalle}`;

  const link = document.createElement("a");
  link.href = referenceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "mt-1 inline-block text-xs font-semibold text-sky-800 underline underline-offset-2 hover:text-sky-950";
  link.textContent = `Ver referencia en ${reference.fuente} · consultado ${reference.consultado_el}`;

  parent.replaceChildren(text, link);
  parent.classList.remove("hidden");
}

function availabilityClasses(status) {
  if (status === "Vendido") return "bg-red-100 text-red-800";
  if (status === "Reservado") return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-800";
}

function productSearchText(product) {
  return [
    product.titulo,
    product.categoria,
    product.estado_producto,
    product.resumen_corto,
    product.notas_importantes,
    ...Object.entries(product.especificaciones || {}).flat(),
  ].join(" ").toLocaleLowerCase("es");
}

function createProductCard(product) {
  const sold = product.disponibilidad === "Vendido";
  const discount = product.precio_anterior > product.precio && product.precio > 0
    ? Math.round((1 - product.precio / product.precio_anterior) * 100)
    : null;
  const card = document.createElement("article");
  card.className = `min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${sold ? "opacity-60" : ""}`;
  card.innerHTML = `
    <div class="relative overflow-hidden bg-slate-100">
      <img src="${escapeHtml(product.fotos[0] || PLACEHOLDER_IMAGE)}" width="800" height="600" alt="${escapeHtml(product.titulo)}" class="product-photo w-full object-cover" loading="lazy" decoding="async">
      <span class="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${availabilityClasses(product.disponibilidad)}">${escapeHtml(product.disponibilidad)}</span>
      ${discount ? `<span class="absolute right-3 top-3 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-white">-${discount}%</span>` : ""}
    </div>
    <div class="flex min-h-[245px] flex-col p-5">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">${escapeHtml(product.estado_producto)}</span>
        <span class="text-xs font-medium text-slate-600">${escapeHtml(product.categoria)}</span>
      </div>
      <h3 class="text-lg font-bold leading-snug text-slate-900">${escapeHtml(product.titulo)}</h3>
      <p class="line-clamp-2 mt-2 min-h-10 text-sm leading-relaxed text-slate-600">${escapeHtml(product.resumen_corto)}</p>
      <div class="mt-4 flex items-baseline gap-2">
        <span class="text-xl font-black text-slate-950">${formatPrice(product.precio)}</span>
        ${product.precio_anterior > product.precio ? `<span class="text-sm text-slate-600 line-through">${formatPrice(product.precio_anterior)}</span>` : ""}
      </div>
      ${product.mostrar_ahorro && product.precio_anterior > product.precio ? `<p class="mt-1 text-xs font-bold text-emerald-700">Ahorras ${formatPrice(product.precio_anterior - product.precio)} vs. precio anterior publicado</p>` : ""}
      <div class="online-reference mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3"></div>
      <button type="button" class="mt-auto min-h-12 rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-900 focus:outline-none focus:ring-4 focus:ring-teal-200">
        Ver ficha técnica y fotos
      </button>
    </div>`;
  renderOnlineReference(card.querySelector(".online-reference"), product);
  const image = card.querySelector("img");
  image.addEventListener("error", () => {
    if (!image.src.endsWith(PLACEHOLDER_IMAGE)) {
      image.src = PLACEHOLDER_IMAGE;
      image.alt = `Imagen no disponible: ${product.titulo}`;
    }
  }, { once: true });
  card.querySelector("button").addEventListener("click", () => openProduct(product));
  return card;
}

function renderProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase("es");
  const visibleProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === "Todos" || product.categoria === selectedCategory;
    const matchesQuery = productSearchText(product).includes(query);
    const matchesAvailability = !availableOnly.checked || product.disponibilidad === "Disponible";
    return matchesCategory && matchesQuery && matchesAvailability;
  });

  if (sortSelect.value === "precio-asc") {
    visibleProducts.sort((a, b) => a.precio - b.precio);
  } else if (sortSelect.value === "precio-desc") {
    visibleProducts.sort((a, b) => b.precio - a.precio);
  }

  grid.replaceChildren(...visibleProducts.map(createProductCard));
  countLabel.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? "producto" : "productos"}`;
  emptyState.classList.toggle("hidden", visibleProducts.length > 0);
}

function setImageSource(image, source) {
  image.src = source || PLACEHOLDER_IMAGE;
  image.onerror = () => {
    image.onerror = null;
    image.src = PLACEHOLDER_IMAGE;
  };
}

function selectPhoto(product, index) {
  mainPhoto.loading = "eager";
  mainPhoto.decoding = "async";
  setImageSource(mainPhoto, product.fotos[index]);
  mainPhoto.alt = `${product.titulo} — foto ${index + 1}`;
  thumbnails.querySelectorAll("button").forEach((button, buttonIndex) => {
    button.classList.toggle("thumb-active", buttonIndex === index);
    button.setAttribute("aria-pressed", String(buttonIndex === index));
  });
}

function setContactActions(product) {
  const sold = product.disponibilidad === "Vendido";
  const actions = document.querySelector("#acciones-contacto");
  const soldMessage = document.querySelector("#modal-vendido");
  const whatsapp = document.querySelector("#boton-whatsapp");
  const marketplace = document.querySelector("#boton-marketplace");
  actions.classList.toggle("hidden", sold);
  soldMessage.classList.toggle("hidden", !sold);
  if (sold) return;

  const price = product.precio > 0 ? CLP.format(product.precio) : "precio por confirmar";
  const message = `Hola Francisco, vi tu catálogo web y me interesa el producto: ${product.titulo} (${price}). ¿Sigue disponible?`;
  whatsapp.href = `https://wa.me/56969024723?text=${encodeURIComponent(message)}`;
  const marketplaceUrl = safeExternalUrl(product.url_marketplace);
  marketplace.href = marketplaceUrl || "#";
  marketplace.classList.toggle("hidden", !marketplaceUrl);
}

function openProduct(product) {
  lastFocusedElement = document.activeElement;
  document.querySelector("#modal-titulo").textContent = product.titulo;
  document.querySelector("#modal-resumen").textContent = product.resumen_corto;
  document.querySelector("#modal-precio").textContent = formatPrice(product.precio);
  const oldPrice = document.querySelector("#modal-precio-anterior");
  oldPrice.textContent = product.precio_anterior > product.precio ? formatPrice(product.precio_anterior) : "";
  const savings = document.querySelector("#modal-ahorro");
  savings.textContent = product.mostrar_ahorro && product.precio_anterior > product.precio
    ? `Ahorras ${formatPrice(product.precio_anterior - product.precio)} vs. precio anterior publicado`
    : "";
  const onlineReference = document.querySelector("#modal-referencia-online");
  renderOnlineReference(onlineReference, product);

  const availability = document.querySelector("#modal-disponibilidad");
  availability.textContent = product.disponibilidad;
  availability.className = `rounded-full px-3 py-1 text-xs font-bold ${availabilityClasses(product.disponibilidad)}`;
  document.querySelector("#modal-estado").textContent = product.estado_producto;
  document.querySelector("#modal-notas").textContent = product.notas_importantes;
  document.querySelector("#modal-condiciones").textContent =
    "Entrega presencial en Metro Santa Julia, San Joaquín o Grecia (horario a convenir); consulta por WhatsApp las opciones para este producto. Starken: por pagar y previo pago. Electrónicos y monitores se entregan probados y puedo enviar video.";

  specsList.replaceChildren(...Object.entries(product.especificaciones).map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "grid grid-cols-[minmax(7rem,0.7fr)_1.3fr] gap-3 px-4 py-3 text-sm";
    const term = document.createElement("dt");
    term.className = "font-semibold text-slate-700";
    term.textContent = label;
    const description = document.createElement("dd");
    description.className = "text-slate-600";
    description.textContent = value;
    row.append(term, description);
    return row;
  }));

  const photos = product.fotos.length ? product.fotos : [PLACEHOLDER_IMAGE];
  thumbnails.replaceChildren(...photos.map((photo, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shrink-0 rounded-lg p-0.5";
    button.setAttribute("aria-label", `Ver foto ${index + 1} de ${product.titulo}`);
    const image = document.createElement("img");
    image.width = 80;
    image.height = 60;
    image.loading = "lazy";
    image.decoding = "async";
    image.className = "h-16 w-20 rounded-md object-cover";
    image.alt = `${product.titulo} — miniatura ${index + 1}`;
    if (index === 0) {
      setImageSource(image, photo);
      image.dataset.loaded = "true";
    } else {
      image.src = PLACEHOLDER_IMAGE;
      image.dataset.photo = photo;
    }
    button.append(image);
    const loadThumbnail = () => {
      if (image.dataset.loaded === "true") return;
      setImageSource(image, image.dataset.photo);
      image.dataset.loaded = "true";
    };
    button.addEventListener("mouseenter", loadThumbnail);
    button.addEventListener("focus", loadThumbnail);
    button.addEventListener("click", () => {
      loadThumbnail();
      selectPhoto(product, index);
    });
    return button;
  }));
  selectPhoto(product, 0);
  setContactActions(product);
  dialog.showModal();
  document.body.classList.add("modal-open");
  document.querySelector("#cerrar-modal").focus();
}

document.querySelector("#categorias").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectedCategory = button.dataset.category;
  document.querySelectorAll(".category-button").forEach((categoryButton) => {
    const selected = categoryButton === button;
    categoryButton.setAttribute("aria-pressed", String(selected));
    categoryButton.classList.toggle("bg-slate-900", selected);
    categoryButton.classList.toggle("text-white", selected);
    categoryButton.classList.toggle("border", !selected);
    categoryButton.classList.toggle("border-slate-200", !selected);
    categoryButton.classList.toggle("bg-white", !selected);
    categoryButton.classList.toggle("text-slate-600", !selected);
  });
  renderProducts();
});

searchInput.addEventListener("input", renderProducts);
availableOnly.addEventListener("change", () => {
  document.querySelector("#estado-disponibilidad").textContent = availableOnly.checked
    ? "Solo disponibles"
    : "Todos (incluyendo vendidos)";
  renderProducts();
});
sortSelect.addEventListener("change", renderProducts);
document.querySelector("#cerrar-modal").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  document.body.classList.remove("modal-open");
  if (lastFocusedElement && lastFocusedElement.isConnected) lastFocusedElement.focus();
  lastFocusedElement = null;
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

fetch("productos.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data)) throw new TypeError("El catálogo debe ser una lista de productos.");
    products = data;
    loadingState.classList.add("hidden");
    renderProducts();
  })
  .catch((error) => {
    console.error("No se pudo cargar productos.json:", error);
    loadingState.classList.add("hidden");
    loadError.classList.remove("hidden");
  });
