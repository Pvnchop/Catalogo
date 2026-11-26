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
const countLabel = document.querySelector("#resultado-conteo");
const emptyState = document.querySelector("#sin-resultados");
const loadError = document.querySelector("#error-carga");
const dialog = document.querySelector("#modal-producto");
const mainPhoto = document.querySelector("#foto-principal");
const thumbnails = document.querySelector("#miniaturas");
const specsList = document.querySelector("#tabla-especificaciones");
let products = [];
let selectedCategory = "Todos";

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
    ...Object.entries(product.especificaciones).flat(),
  ].join(" ").toLocaleLowerCase("es");
}

function createProductCard(product) {
  const sold = product.disponibilidad === "Vendido";
  const discount = product.precio_anterior > product.precio && product.precio > 0
    ? Math.round((1 - product.precio / product.precio_anterior) * 100)
    : null;
  const card = document.createElement("article");
  card.className = `overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${sold ? "opacity-65" : ""}`;
  card.innerHTML = `
    <div class="relative overflow-hidden bg-slate-100">
      <img src="${escapeHtml(product.fotos[0] || PLACEHOLDER_IMAGE)}" alt="${escapeHtml(product.titulo)}" class="aspect-[4/3] w-full object-cover" loading="lazy">
      <span class="absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${availabilityClasses(product.disponibilidad)}">${escapeHtml(product.disponibilidad)}</span>
      ${discount ? `<span class="absolute right-3 top-3 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-white">-${discount}%</span>` : ""}
    </div>
    <div class="flex min-h-[245px] flex-col p-5">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">${escapeHtml(product.estado_producto)}</span>
        <span class="text-xs font-medium text-slate-400">${escapeHtml(product.categoria)}</span>
      </div>
      <h3 class="text-lg font-bold leading-snug text-slate-900">${escapeHtml(product.titulo)}</h3>
      <p class="line-clamp-2 mt-2 min-h-10 text-sm leading-relaxed text-slate-600">${escapeHtml(product.resumen_corto)}</p>
      <div class="mt-4 flex items-baseline gap-2">
        <span class="text-xl font-black text-slate-950">${formatPrice(product.precio)}</span>
        ${product.precio_anterior > product.precio ? `<span class="text-sm text-slate-400 line-through">${formatPrice(product.precio_anterior)}</span>` : ""}
      </div>
      ${product.mostrar_ahorro && product.precio_anterior > product.precio ? `<p class="mt-1 text-xs font-bold text-emerald-700">Ahorras ${formatPrice(product.precio_anterior - product.precio)} vs. precio anterior publicado</p>` : ""}
      <div class="online-reference mt-3 rounded-xl border border-sky-100 bg-sky-50 p-3"></div>
      <button type="button" class="mt-auto rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-900 focus:outline-none focus:ring-4 focus:ring-teal-200">
        Ver ficha técnica y fotos
      </button>
    </div>`;
  renderOnlineReference(card.querySelector(".online-reference"), product);
  const image = card.querySelector("img");
  image.addEventListener("error", () => {
    if (!image.src.endsWith(PLACEHOLDER_IMAGE)) image.src = PLACEHOLDER_IMAGE;
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
  setImageSource(mainPhoto, product.fotos[index]);
  mainPhoto.alt = `${product.titulo} — foto ${index + 1}`;
  thumbnails.querySelectorAll("button").forEach((button, buttonIndex) => {
    button.classList.toggle("thumb-active", buttonIndex === index);
    button.setAttribute("aria-pressed", String(buttonIndex === index));
  });
}

function setContactActions(product) {
  const sold = product.disponibilidad === "Vendido";
  const whatsapp = document.querySelector("#boton-whatsapp");
  const marketplace = document.querySelector("#boton-marketplace");
  whatsapp.disabled = sold;
  marketplace.disabled = sold;
  whatsapp.onclick = () => {
    const price = product.precio > 0 ? CLP.format(product.precio) : "precio por confirmar";
    const message = `Hola Francisco, vi tu catálogo web y me interesa el producto: ${product.titulo} (${price}). ¿Sigue disponible?`;
    window.open(`https://wa.me/56969024723?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  marketplace.onclick = () => {
    if (product.url_marketplace) window.open(product.url_marketplace, "_blank", "noopener,noreferrer");
  };
}

function openProduct(product) {
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
    button.setAttribute("aria-label", `Ver foto ${index + 1}`);
    const image = document.createElement("img");
    image.className = "h-16 w-20 rounded-md object-cover";
    image.alt = "";
    setImageSource(image, photo);
    button.append(image);
    button.addEventListener("click", () => selectPhoto(product, index));
    return button;
  }));
  selectPhoto(product, 0);
  setContactActions(product);
  dialog.showModal();
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
availableOnly.addEventListener("change", renderProducts);
document.querySelector("#cerrar-modal").addEventListener("click", () => dialog.close());
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
    renderProducts();
  })
  .catch((error) => {
    console.error("No se pudo cargar productos.json:", error);
    loadError.classList.remove("hidden");
  });
