"use strict";

class NewsCountError extends Error {
    constructor(value, totalPages) {
        super(
            `Invalid news page: ${JSON.stringify(value)}; expected integer in [1, ${totalPages}]`);
        this.name = "NewsCountError";
        this.value = value;
        this.userMessage =
            "Не удалось открыть эту страницу. Выберите доступную страницу новостей.";
    }
}

const PAGE_SIZE = 30;
const state = {
    page: 1,
    query: "",
    severity: "all",
    sort: "date-desc"
};
const grid = document.getElementById("news-grid");
const paginationMessage = document.getElementById("pagination-message");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const dialog = document.getElementById("detail-dialog");
const severityNames = {
    critical: "Критическая",
    high: "Высокая",
    medium: "Средняя",
    low: "Низкая"
};
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
});
let dialogTrigger = null;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function displayDate(value) {
    return value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : "Нет данных";
}

function displayScore(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "Нет данных";
}

function safeLink(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

function badge(item) {
    return element("span", `badge ${severityNames[item.severity] ? item.severity : "unknown"}`,
        severityNames[item.severity] || "Нет данных");
}

function renderStats() {
    let critical = 0;
    let high = 0;
    let exploited = 0;
    for (const item of news) {
        if (item.severity === "critical") {
            critical++;
        }
        if (item.severity === "high") {
            high++;
        }
        if (item.exploited === true) {
            exploited++;
        }
    }
    const metrics = [
        [news.length, "публикаций"],
        [critical, "критических"],
        [high, "высоких"],
        [exploited, "эксплуатируются"]
    ];
    const stats = document.getElementById("overview");
    for (const [value, label] of metrics) {
        const stat = element("div", "stat");
        const labels = element("div");
        labels.append(element("span", "stat-label", label));
        stat.append(element("strong", "stat-number", String(value)), labels);
        stats.append(stat);
    }
    document.getElementById("all-total").textContent = news.length;
}

function createCard(item) {
    const card = element("div", "news-card");
    const top = element("div", "card-top");
    const imageFrame = element("div", "product-image");
    const image = element("img");
    image.src = /^assets\/img\/[a-z-]+\.svg$/.test(item.image) ? item.image :
        "assets/img/shield.svg";
    image.alt = `Иконка ${item.product}`;
    image.width = 28;
    image.height = 28;
    image.loading = "lazy";
    imageFrame.append(image);
    const product = element("div", "card-product");
    product.append(imageFrame, element("span", "", item.product));
    top.append(product, element("span", "card-date", displayDate(item.date)));
    top.lastElementChild.title = "Дата публикации";
    const tags = element("div", "card-tags");
    tags.append(badge(item));
    if (item.exploited === true) {
        tags.append(element("span", "exploited-tag", "Эксплуатация подтверждена"));
    }
    const meta = element("div", "card-meta");
    const score = element("span", "card-score", "CVSS ");
    score.append(element("strong", "", displayScore(item.cvss)));
    meta.append(element("span", "", item.cve || "Нет данных"), score);
    const button = element("button", "details-button", "Подробнее");
    button.type = "button";
    button.setAttribute("aria-label", `Подробнее: ${item.cve || item.product}`);
    button.addEventListener("click", () => openDetails(item, button));
    const bottom = element("div", "card-bottom");
    bottom.append(meta, button);
    card.append(top, element("h3", "", item.title), element("p", "card-description", item
        .description), tags, bottom);
    return card;
}

function getFilteredNews() {
    const filtered = [];
    const query = state.query.trim().toLocaleLowerCase("ru-RU");
    for (const item of news) {
        const searchable =
            `${item.product} ${item.vendor} ${item.title} ${item.cve || ""} ${(item.aliases || []).join(" ")}`
            .toLocaleLowerCase("ru-RU");
        if ((state.severity === "all" || item.severity === state.severity) && searchable.includes(
                query)) {
            filtered.push(item);
        }
    }
    return filtered;
}

function renderNews() {
    const filtered = getFilteredNews();
    filtered.sort((a, b) => {
        let result;
        if (state.sort.startsWith("cvss")) {
            if (a.cvss === null || b.cvss === null) {
                return a.cvss === b.cvss ? a.id - b.id : a.cvss === null ? 1 : -1;
            }
            result = state.sort === "cvss-desc" ? b.cvss - a.cvss : a.cvss - b.cvss;
        } else {
            result = state.sort === "date-desc" ? (b.date || "").localeCompare(a.date ||
                "") : (a.date || "").localeCompare(b.date || "");
        }
        return result || a.id - b.id;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, filtered.length);
    const fragment = document.createDocumentFragment();
    for (let index = start; index < end; index++) {
        fragment.append(createCard(filtered[index]));
    }
    grid.replaceChildren(fragment);
    document.getElementById("empty").hidden = filtered.length > 0;
    document.getElementById("results").textContent = filtered.length === 0 ?
        `Найдено 0 · Всего в базе: ${news.length}` :
        `Показано ${start + 1}-${end} из ${filtered.length} · Всего в базе: ${news.length}`;
    document.getElementById("page-status").textContent = `Страница ${state.page} из ${totalPages}`;
    document.getElementById("previous-page").disabled = state.page === 1;
    document.getElementById("next-page").disabled = state.page === totalPages;
    document.querySelector(".pagination").hidden = filtered.length === 0;
}

function changePage(page) {
    const totalPages = Math.max(1, Math.ceil(getFilteredNews().length / PAGE_SIZE));
    try {
        if (!Number.isInteger(page) || page < 1 || page > totalPages) {
            throw new NewsCountError(page, totalPages);
        }
        state.page = page;
        paginationMessage.hidden = true;
        renderNews();
        document.getElementById("feed").scrollIntoView({
            behavior: "instant"
        });
    } catch (error) {
        console.error("[CyberWatch] Pagination failed", {
            name: error.name,
            message: error.message,
            value: error.value,
            stack: error.stack
        });
        paginationMessage.textContent = error instanceof NewsCountError ? error.userMessage :
            "Не удалось открыть страницу. Попробуйте ещё раз.";
        paginationMessage.hidden = false;
    }
}

document.getElementById("previous-page").addEventListener("click", () => changePage(state.page -
1));
document.getElementById("next-page").addEventListener("click", () => changePage(state.page + 1));

searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    state.page = 1;
    paginationMessage.hidden = true;
    renderNews();
});

sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    state.page = 1;
    renderNews();
});

for (const button of document.querySelectorAll(".filter")) {
    button.addEventListener("click", () => {
        state.severity = button.dataset.severity;
        state.page = 1;
        paginationMessage.hidden = true;
        updateFilterButtons();
        renderNews();
    });
}

function updateFilterButtons() {
    for (const button of document.querySelectorAll(".filter")) {
        const selected = button.dataset.severity === state.severity;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
    }
}

function resetFilters() {
    Object.assign(state, {
        page: 1,
        query: "",
        severity: "all",
        sort: "date-desc"
    });
    searchInput.value = "";
    sortSelect.value = "date-desc";
    paginationMessage.hidden = true;
    updateFilterButtons();
    renderNews();
}

document.getElementById("reset").addEventListener("click", resetFilters);
document.getElementById("empty-reset").addEventListener("click", resetFilters);

function detailSection(parent, title, text) {
    parent.append(element("h3", "", title), element("p", "", text || "Нет данных"));
}

function appendSource(parent, url, label) {
    const href = safeLink(url);
    if (!href) {
        return;
    }
    const link = element("a", "dialog-source", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    parent.append(link);
}

function openDetails(item, trigger) {
    const content = document.getElementById("dialog-content");
    const title = element("h2", "", item.title);
    title.id = "dialog-title";
    const facts = element("div", "dialog-facts");
    facts.append(element("span", "", item.cve || "CVE: Нет данных"), badge(item), element("span",
            "",
            `CVSS${item.cvssVersion ? ` ${item.cvssVersion}` : ""}: ${displayScore(item.cvss)}`
            ));
    content.replaceChildren(title, facts);
    detailSection(content, "Описание", item.details);
    detailSection(content, "Затронутый продукт",
        `${item.vendor} · ${item.affected || item.product}`);
    detailSection(content, "Возможные последствия", item.impact);
    detailSection(content, "Эксплуатация в реальных атаках", item.exploited === true ?
        "Подтверждена в указанном источнике." : item.exploited === false ?
        "Источник прямо сообщает об отсутствии известных случаев на дату публикации." :
        "Нет данных. Подтверждение реальных атак в использованном источнике отсутствует.");
    const recommendation = element("div", "recommendation");
    detailSection(recommendation, "Рекомендации по защите", item.recommendation);
    content.append(recommendation);
    detailSection(content, "Данные уязвимости",
        `Опубликовано: ${displayDate(item.date)}. Источник оценки CVSS ${item.cvssVersion || ""}: ${item.scoreAuthority || "Нет данных"}.`
        );
    appendSource(content, item.source, "Источник уязвимости");
    content.append(document.createTextNode(" · "));
    appendSource(content, item.advisory, "Дополнительный первоисточник");
    dialogTrigger = trigger;
    dialog.showModal();
    dialog.scrollTop = 0;
    document.body.classList.add("modal-open");
    document.getElementById("close-dialog").focus();
}

document.getElementById("close-dialog").addEventListener("click", () => dialog.close());

dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds
            .right || event.clientY < bounds.top || event.clientY > bounds.bottom)) {
        dialog.close();
    }
});

dialog.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    if (dialogTrigger && dialogTrigger.isConnected) {
        dialogTrigger.focus();
    }
});

renderStats();
renderNews();
