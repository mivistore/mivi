/* =========================================================
   MIHA — MAIN JAVASCRIPT
========================================================= */


/* =========================================================
   FIREBASE SETUP
   This is what makes products, orders and customers sync
   live across every device — instead of being stuck inside
   one browser's localStorage.
========================================================= */

const firebaseConfig = {
    apiKey: "AIzaSyBYLppTTZjJDbjZi2eQiR_r7t8jThIhaiw",
    authDomain: "mivi-store.firebaseapp.com",
    projectId: "mivi-store",
    storageBucket: "mivi-store.firebasestorage.app",
    messagingSenderId: "1067893400212",
    appId: "1:1067893400212:web:246f6db5d25b8c505d8a81",
    measurementId: "G-WKC0GKMJW5"
};

firebase.initializeApp(firebaseConfig);
// Initialize App Check with your reCAPTCHA Enterprise key
const appCheck = firebase.appCheck().activate('6Lc0YrUtAAAAAKRMtGz7Zs4yJ_dBx6t_DEEp6gTm', true);


const db = firebase.firestore();


/* =========================================================
   DEFAULT DATA
========================================================= */

const DEFAULT_PRODUCTS = [

    {
        id: "mivi-001",
        name: "Little Pink Bunny",
        price: 599,
        description: "A soft little crochet bunny made with lots of love.",
        image: "",
        images: [],
        category: "Uncategorized",
    },

    {
        id: "mivi-002",
        name: "Blue Cloud",
        price: 499,
        description: "A dreamy handmade cloud for your cutest corner.",
        image: "",
        images: [],
        category: "Uncategorized",
    },

    {
        id: "mivi-003",
        name: "Cute Mini Bear",
        price: 699,
        description: "A tiny handmade bear looking for a new home.",
        image: "",
        images: [],
        category: "Uncategorized",
    },

    {
        id: "mivi-004",
        name: "Pink Flower",
        price: 299,
        description: "A sweet little crochet flower that never fades.",
        image: "",
    }

];

const DEFAULT_SALE_IDEA =
    "Weekend bundle: save 10% when you choose any two handmade pieces.";

const DEFAULT_HERO_PHOTO = "assets/miha-logo.png";
const DEFAULT_BRAND_LOGO = "assets/miha-logo-mark.png";
const DEFAULT_BRAND_NAME = "MIHA Store";
const MIHA_BRAND_VERSION = "miha-v2";


/* =========================================================
   SHARED STATE
   products / orders / customers / saleIdea / heroPhoto /
   adminData now live in Firestore and are kept in sync live
   through onSnapshot listeners (see startLiveSync below).
   cart stays in localStorage on purpose — it's personal to
   each shopper's own browser.
========================================================= */

let products = [];

let orders = [];

let customers = [];

let cart =
    JSON.parse(localStorage.getItem("miviCart"))
    || [];

let adminData = {
    id: "miviadmin",
    password: "miviadmin"
};

let saleIdea = DEFAULT_SALE_IDEA;

let heroPhoto = DEFAULT_HERO_PHOTO;
let heroSlides = [{ image: DEFAULT_HERO_PHOTO, productId: null }];
let heroSlideIndex = 0;
let heroSlideTimer = null;
let heroTouchStartX = 0;
let heroTouchDeltaX = 0;
let brandLogo = DEFAULT_BRAND_LOGO;
let brandName = DEFAULT_BRAND_NAME;
let categories = ["Uncategorized"];
let activeCategory = "All";

let productsSeeded = false;


function syncSharedState() {

    /*
       No-op now on purpose.
       Firestore's onSnapshot listeners (startLiveSync) already
       keep products/orders/customers/settings updated live, so
       there's nothing left to manually re-read here. Kept as an
       empty function so existing calls elsewhere don't break.
    */

}


function updateSyncIndicator(state) {

    const el = document.getElementById("cloudSyncStatus");
    if (!el) return;

    clearTimeout(updateSyncIndicator._timer);

    if (state === "saving") {

        el.textContent = "Saving to cloud...";
        el.className = "cloud-sync-status saving";

    } else if (state === "saved") {

        el.textContent = "All changes saved ✓";
        el.className = "cloud-sync-status saved";

        updateSyncIndicator._timer = setTimeout(() => {
            el.className = "cloud-sync-status";
        }, 2500);

    } else if (state === "error") {

        el.textContent = "⚠ Could not save — check your internet and try again";
        el.className = "cloud-sync-status error";

    }

}


function saveCart() {

    localStorage.setItem(
        "miviCart",
        JSON.stringify(cart)
    );

}


async function saveProducts() {

    updateSyncIndicator("saving");

    try {

        const snapshot = await db.collection("products").get();
        const batch = db.batch();
        const currentIds = new Set(products.map(item => String(item.id)));

        products.forEach(product => {
            batch.set(db.collection("products").doc(String(product.id)), product);
        });

        snapshot.forEach(doc => {
            if (!currentIds.has(doc.id)) {
                batch.delete(doc.ref);
            }
        });

        await batch.commit();

        updateSyncIndicator("saved");

    } catch (error) {
        console.error("saveProducts failed:", error);
        updateSyncIndicator("error");
        throw error;
    }

}


async function saveOrders() {

    updateSyncIndicator("saving");

    try {

        const snapshot = await db.collection("orders").get();
        const batch = db.batch();
        const currentIds = new Set(orders.map(item => String(item.id)));

        orders.forEach(order => {
            batch.set(db.collection("orders").doc(String(order.id)), order);
        });

        snapshot.forEach(doc => {
            if (!currentIds.has(doc.id)) {
                batch.delete(doc.ref);
            }
        });

        await batch.commit();

        updateSyncIndicator("saved");

    } catch (error) {
        console.error("saveOrders failed:", error);
        updateSyncIndicator("error");
        throw error;
    }

}


function generateCustomerId(customer) {

    const base =
        (customer.email && customer.email.toLowerCase())
        || (customer.instagram && customer.instagram.toLowerCase())
        || customer.phone
        || ("guest-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

    return base.replace(/[^a-z0-9]/gi, "_").slice(0, 120);

}


function saveCustomers() {

    updateSyncIndicator("saving");

    const batch = db.batch();

    customers.forEach(customer => {

        if (!customer.id) {
            customer.id = generateCustomerId(customer);
        }

        batch.set(db.collection("customers").doc(customer.id), customer);

    });

    batch.commit()
        .then(() => updateSyncIndicator("saved"))
        .catch(error => {
            console.error("saveCustomers failed:", error);
            updateSyncIndicator("error");
        });

}


function saveAdmin() {

    updateSyncIndicator("saving");

    db.collection("settings").doc("store").set({
        adminId: adminData.id,
        adminPassword: adminData.password
    }, { merge: true })
        .then(() => updateSyncIndicator("saved"))
        .catch(error => {
            console.error("saveAdmin failed:", error);
            updateSyncIndicator("error");
        });

}


function saveHeroPhoto() {

    updateSyncIndicator("saving");

    db.collection("settings").doc("store").set({
        heroPhoto: getHeroSlideImage(heroSlides[0]) || DEFAULT_HERO_PHOTO,
        heroSlides,
        brandVersion: MIHA_BRAND_VERSION
    }, { merge: true })
        .then(() => updateSyncIndicator("saved"))
        .catch(error => {
            console.error("saveHeroPhoto failed:", error);
            updateSyncIndicator("error");
        });

}


function saveBrandSettings() {

    const nameInput = document.getElementById("settingsBrandName");
    const message = document.getElementById("brandSettingsMessage");

    const nextName = nameInput ? nameInput.value.trim() : "";

    if (!nextName) {
        if (message) message.textContent = "Please enter a store name.";
        return;
    }

    brandName = nextName;

    updateSyncIndicator("saving");

    db.collection("settings").doc("store").set({
        brandName,
        brandLogo,
        brandVersion: MIHA_BRAND_VERSION
    }, { merge: true })
        .then(() => {
            updateBrandUI();
            if (message) message.textContent = "Store branding saved.";
            updateSyncIndicator("saved");
        })
        .catch(error => {
            console.error("saveBrandSettings failed:", error);
            if (message) message.textContent = "Could not save branding.";
            updateSyncIndicator("error");
        });

}


function saveCategoriesToCloud() {
    updateSyncIndicator("saving");
    return db.collection("settings").doc("store").set({ categories }, { merge: true })
        .then(() => updateSyncIndicator("saved"))
        .catch(error => { console.error("saveCategories failed:", error); updateSyncIndicator("error"); throw error; });
}

function renderCategoryFilters() {
    const container = document.getElementById("categoryFilters");
    if (!container) return;
    const unique = Array.from(new Set(["All", ...categories]));
    container.innerHTML = unique.map(category =>
        `<button class="category-filter ${activeCategory === category ? "active" : ""}" onclick="setActiveCategory('${escapeHTML(category).replace(/'/g, "\\'")}')">${escapeHTML(category)}</button>`
    ).join("");
}

function setActiveCategory(category) {
    activeCategory = category || "All";
    renderProducts();
}

function renderAdminCategories() {
    const list = document.getElementById("adminCategoryList");
    if (!list) return;
    list.innerHTML = categories.map(category => `
        <div class="admin-category-chip">
            <span>${escapeHTML(category)}</span>
            ${category !== "Uncategorized" ? `<button type="button" onclick="deleteCategory('${escapeHTML(category).replace(/'/g, "\\'")}')">×</button>` : ""}
        </div>`).join("");
}

function populateProductCategories() {
    const select = document.getElementById("productCategory");
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">Select a category</option>` + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("");
    if (categories.includes(current)) select.value = current;
}

function createCategory() {
    const input = document.getElementById("newCategoryInput");
    if (!input) return;
    const value = input.value.trim().replace(/\s+/g, " ");
    if (!value) return;
    if (categories.some(item => item.toLowerCase() === value.toLowerCase())) {
        alert("That category already exists.");
        return;
    }
    categories.push(value);
    input.value = "";
    renderAdminCategories();
    populateProductCategories();
    renderCategoryFilters();
    saveCategoriesToCloud().catch(() => {});
}

function deleteCategory(category) {
    if (category === "Uncategorized") return;
    if (products.some(product => (product.category || "Uncategorized") === category)) {
        alert("This category has products. Move those products to another category before deleting it.");
        return;
    }
    categories = categories.filter(item => item !== category);
    if (activeCategory === category) activeCategory = "All";
    renderAdminCategories();
    populateProductCategories();
    renderCategoryFilters();
    saveCategoriesToCloud().catch(() => {});
}

function saveSaleIdeaToCloud() {

    updateSyncIndicator("saving");

    db.collection("settings").doc("store").set({
        saleIdea
    }, { merge: true })
        .then(() => updateSyncIndicator("saved"))
        .catch(error => {
            console.error("saveSaleIdea failed:", error);
            updateSyncIndicator("error");
        });

}


/* =========================================================
   LIVE SYNC
   Keeps every open tab/device updated in real time whenever
   anything changes in the shared database.
========================================================= */

function startLiveSync() {

    db.collection("products").onSnapshot(snapshot => {

        if (snapshot.empty && !productsSeeded) {

            productsSeeded = true;

            DEFAULT_PRODUCTS.forEach(product => {
                db.collection("products").doc(product.id).set(product);
            });

            return;
        }

        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        products = products.map(product => ({ ...product, category: product.category || "Uncategorized", images: getProductImages(product) }));
        if (!categories.includes("Uncategorized")) categories.push("Uncategorized");

        if (typeof renderProducts === "function") renderProducts();
        if (typeof renderAdminProducts === "function") renderAdminProducts();
        if (typeof renderHeroSlideshow === "function") renderHeroSlideshow();
        if (typeof renderAdminHeroSlides === "function") renderAdminHeroSlides();
        if (typeof updateStats === "function") updateStats();

    }, error => console.error("products listener failed:", error));


    db.collection("orders").onSnapshot(snapshot => {

        orders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (typeof updateAdminDashboard === "function") updateAdminDashboard();

    }, error => console.error("orders listener failed:", error));


    db.collection("customers").onSnapshot(snapshot => {

        customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (typeof renderCustomers === "function") renderCustomers();
        if (typeof updateStats === "function") updateStats();

    }, error => console.error("customers listener failed:", error));


    db.collection("settings").doc("store").onSnapshot(doc => {

        if (!doc.exists) return;

        const data = doc.data();

        if (data.adminId) adminData.id = data.adminId;
        if (data.adminPassword) adminData.password = data.adminPassword;
        if (typeof data.saleIdea === "string") {
            saleIdea = data.saleIdea;
            const banner = document.getElementById("customerSaleBanner");
            const bannerText = document.getElementById("customerSaleIdea");
            if (bannerText) bannerText.textContent = saleIdea;
            if (banner) banner.style.display = saleIdea.trim() ? "block" : "none";
        }
        if (typeof data.brandName === "string" && data.brandName.trim()) {
            brandName = data.brandName.trim();
        }

        if (typeof data.brandLogo === "string" && data.brandLogo) {
            brandLogo = data.brandLogo;
        }

        if (Array.isArray(data.categories) && data.categories.length) {
            categories = Array.from(new Set(data.categories.map(item => String(item).trim()).filter(Boolean)));
        } else {
            categories = ["Uncategorized"];
        }

        if (Array.isArray(data.heroSlides) && data.heroSlides.length) {
            heroSlides = data.heroSlides.map(normalizeHeroSlide).filter(item => item.image);
        } else if (typeof data.heroPhoto === "string" && data.heroPhoto) {
            heroSlides = [{ image: data.heroPhoto, productId: null }];
        } else {
            heroSlides = [{ image: DEFAULT_HERO_PHOTO, productId: null }];
        }

        heroSlideIndex = Math.min(heroSlideIndex, Math.max(heroSlides.length - 1, 0));
        heroPhoto = getHeroSlideImage(heroSlides[heroSlideIndex]) || DEFAULT_HERO_PHOTO;

        updateBrandUI();
        renderHeroSlideshow();
        renderAdminHeroSlides();

        // One-time migration from the previous single-photo version.
        if (data.brandVersion !== MIHA_BRAND_VERSION) {
            db.collection("settings").doc("store").set({
                brandVersion: MIHA_BRAND_VERSION,
                brandName,
                brandLogo,
                heroSlides,
                categories
            }, { merge: true }).catch(error =>
                console.error("MIHA brand migration failed:", error)
            );
        }

    }, error => console.error("settings listener failed:", error));

}


function checkFirebaseConnection() {

    db.collection("settings").doc("connection-check").set({
        checkedAt: new Date().toISOString()
    }).then(() => {

        const banner = document.getElementById("connectionWarning");
        if (banner) banner.style.display = "none";

    }).catch(error => {

        console.error("Firebase connection check failed:", error);

        const banner = document.getElementById("connectionWarning");
        if (banner) {
            banner.style.display = "flex";
            const detail = document.getElementById("connectionWarningDetail");
            if (detail) detail.textContent = String(error && error.message || error);
        }

    });

}


/* =========================================================
   PAGE START
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    startLiveSync();

    checkFirebaseConnection();

    setTimeout(() => {

        const loader =
            document.getElementById("loadingScreen");

        if (loader) {

            loader.style.opacity = "0";

            setTimeout(() => {
                loader.style.display = "none";
            }, 600);

        }

    }, 800);


    renderProducts();

    const saleBanner = document.getElementById("customerSaleBanner");
    const saleBannerText = document.getElementById("customerSaleIdea");
    if (saleBannerText) saleBannerText.textContent = saleIdea;
    if (saleBanner) saleBanner.style.display = saleIdea.trim() ? "block" : "none";
    renderCategoryFilters();
    renderAdminCategories();
    populateProductCategories();

    renderCart();

    updateCartCount();

    updateAdminDashboard();

    renderHeroSlideshow();
    setupHeroSwipe();
    updateBrandUI();
    renderAdminHeroSlides();

    updateAccountUI();

});


function updateBrandUI() {

    const logo = document.getElementById("brandLogoPreview");
    const name = document.getElementById("brandNameDisplay");
    const adminLogo = document.getElementById("adminBrandLogoPreview");
    const adminName = document.getElementById("adminBrandNamePreview");
    const footerLogo = document.getElementById("footerBrandLogo");
    const footerName = document.getElementById("footerBrandName");
    const nameInput = document.getElementById("settingsBrandName");

    const activeLogo = brandLogo || DEFAULT_BRAND_LOGO;
    const activeName = brandName || DEFAULT_BRAND_NAME;

    if (logo) logo.src = activeLogo;
    if (name) name.textContent = activeName;
    if (adminLogo) adminLogo.src = activeLogo;
    if (adminName) adminName.textContent = activeName;
    if (footerLogo) footerLogo.src = activeLogo;
    if (footerName) footerName.textContent = `${activeName} • handmade with love`;
    if (nameInput && document.activeElement !== nameInput) {
        nameInput.value = activeName;
    }

}


function renderHeroSlideshow() {
    const track = document.getElementById("heroSlidesTrack");
    const dots = document.getElementById("heroSlideDots");
    const prev = document.getElementById("heroPrev");
    const next = document.getElementById("heroNext");
    if (!track || !dots) return;

    if (!Array.isArray(heroSlides) || !heroSlides.length) {
        heroSlides = [{ image: DEFAULT_HERO_PHOTO, productId: null }];
    }
    heroSlides = heroSlides.map(normalizeHeroSlide).filter(slide => slide.image);
    heroSlideIndex = Math.max(0, Math.min(heroSlideIndex, heroSlides.length - 1));

    track.innerHTML = heroSlides.map((slide, index) => {
        const product = slide.productId ? products.find(item => item.id === slide.productId) : null;
        const content = `<img src="${slide.image}" alt="MIHA featured image ${index + 1}" draggable="false">`;
        return `<div class="hero-slide ${index === heroSlideIndex ? "active" : ""} ${product ? "hero-slide-clickable" : ""}" ${product ? `onclick="openProduct('${product.id}')" title="View ${escapeHTML(product.name)}"` : ""}>${content}</div>`;
    }).join("");

    dots.innerHTML = heroSlides.length > 1 ? heroSlides.map((_, index) =>
        `<button class="slide-dot ${index === heroSlideIndex ? "active" : ""}" onclick="event.stopPropagation(); goToHeroSlide(${index})" aria-label="Go to image ${index + 1}"></button>`
    ).join("") : "";

    if (prev) prev.style.display = heroSlides.length > 1 ? "grid" : "none";
    if (next) next.style.display = heroSlides.length > 1 ? "grid" : "none";
    startHeroSlideshow();
}


function goToHeroSlide(index) {

    if (!heroSlides.length) return;

    heroSlideIndex = (index + heroSlides.length) % heroSlides.length;
    heroPhoto = getHeroSlideImage(heroSlides[heroSlideIndex]);

    renderHeroSlideshow();
    resetHeroSlideshowTimer();

}


function changeHeroSlide(direction) {

    goToHeroSlide(heroSlideIndex + direction);

}


function startHeroSlideshow() {

    clearInterval(heroSlideTimer);

    if (heroSlides.length <= 1) return;

    heroSlideTimer = setInterval(() => {
        goToHeroSlide(heroSlideIndex + 1);
    }, 5000);

}


function resetHeroSlideshowTimer() {
    startHeroSlideshow();
}


function setupHeroSwipe() {

    const viewport = document.querySelector(".slideshow-viewport");
    if (!viewport || viewport.dataset.swipeReady === "true") return;

    viewport.dataset.swipeReady = "true";

    viewport.addEventListener("touchstart", event => {
        heroTouchStartX = event.touches[0].clientX;
        heroTouchDeltaX = 0;
    }, { passive: true });

    viewport.addEventListener("touchmove", event => {
        heroTouchDeltaX = event.touches[0].clientX - heroTouchStartX;
    }, { passive: true });

    viewport.addEventListener("touchend", () => {
        if (Math.abs(heroTouchDeltaX) < 45) return;

        if (heroTouchDeltaX < 0) {
            changeHeroSlide(1);
        } else {
            changeHeroSlide(-1);
        }
    });

}


function renderAdminHeroSlides() {
    const container = document.getElementById("adminHeroSlidesPreview");
    if (!container) return;

    container.innerHTML = heroSlides.map((rawSlide, index) => {
        const slide = normalizeHeroSlide(rawSlide);
        const options = products.map(product =>
            `<option value="${escapeHTML(product.id)}" ${slide.productId === product.id ? "selected" : ""}>${escapeHTML(product.name)}</option>`
        ).join("");
        return `
            <div class="admin-slide-thumb">
                <img src="${slide.image}" alt="Slide ${index + 1}">
                <button type="button" onclick="removeHeroSlide(${index})" aria-label="Remove slide">×</button>
                <span>${index + 1}</span>
                <select onchange="setHeroSlideProduct(${index}, this.value)">
                    <option value="">No product link</option>
                    ${options}
                </select>
            </div>`;
    }).join("");
}

function setHeroSlideProduct(index, productId) {
    if (!heroSlides[index]) return;
    heroSlides[index] = { ...normalizeHeroSlide(heroSlides[index]), productId: productId || null };
    saveHeroPhoto();
    renderHeroSlideshow();
}


function previewHeroPhoto(event) {

    const files = Array.from(event.target.files || [])
        .filter(file => file.type.startsWith("image/"))
        .slice(0, 6);

    if (!files.length) {
        alert("Please choose image files.");
        return;
    }

    Promise.all(
        files.map(file => compressImageFile(file, 1000, 0.72))
    ).then(images => {

        heroSlides = images.map(image => ({ image, productId: null }));
        heroSlideIndex = 0;
        heroPhoto = getHeroSlideImage(heroSlides[0]);

        saveHeroPhoto();
        renderHeroSlideshow();
        renderAdminHeroSlides();

        const text = document.getElementById("adminHeroPhotoText");
        if (text) text.textContent = `${heroSlides.length} photo${heroSlides.length === 1 ? "" : "s"} selected`;

        event.target.value = "";

    }).catch(error => {
        console.error(error);
        alert("Could not process those photos. Please try smaller images.");
    });

}


function removeHeroSlide(index) {

    if (heroSlides.length <= 1) {
        alert("Keep at least one featured image.");
        return;
    }

    heroSlides.splice(index, 1);
    heroSlideIndex = Math.min(heroSlideIndex, heroSlides.length - 1);
    heroPhoto = getHeroSlideImage(heroSlides[heroSlideIndex]);

    saveHeroPhoto();
    renderHeroSlideshow();
    renderAdminHeroSlides();

}


function previewBrandLogo(event) {

    const file = event.target.files && event.target.files[0];
    if (!file || !file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
    }

    compressImageFile(file, 500, 0.82).then(dataUrl => {
        brandLogo = dataUrl;
        updateBrandUI();
    }).catch(() => {
        alert("Could not process that logo. Please try another image.");
    });

}


/* =========================================================
   CUSTOM CONFIRM MODAL
   (native confirm() is unreliable inside Instagram/WhatsApp
   in-app browsers and some mobile webviews, so we use our
   own on-page confirmation instead)
========================================================= */

let pendingConfirmAction = null;

function showConfirm(message, actionLabel, onConfirm) {

    const messageEl = document.getElementById("confirmMessage");
    const actionBtn = document.getElementById("confirmActionBtn");

    if (messageEl) messageEl.textContent = message;
    if (actionBtn) actionBtn.textContent = actionLabel || "Confirm";

    pendingConfirmAction = onConfirm;

    openModal("confirmModal");

}

function closeConfirm() {

    pendingConfirmAction = null;

    closeModal("confirmModal");

}

document.addEventListener("DOMContentLoaded", () => {

    const actionBtn = document.getElementById("confirmActionBtn");

    if (actionBtn) {
        actionBtn.addEventListener("click", () => {

            const action = pendingConfirmAction;

            closeModal("confirmModal");
            pendingConfirmAction = null;

            if (typeof action === "function") {
                action();
            }

        });
    }

});


/* =========================================================
   PRODUCTS
========================================================= */

function renderProducts() {
    const grid = document.getElementById("productGrid");
    if (!grid) return;

    renderCategoryFilters();

    const visibleProducts = activeCategory === "All"
        ? products
        : products.filter(product => (product.category || "Uncategorized") === activeCategory);

    if (visibleProducts.length === 0) {
        grid.innerHTML = `
            <div class="no-products">
                <div>🧶</div>
                <h3>${products.length ? "No products in this category" : "Something cute is coming..."}</h3>
                <p>${products.length ? "Choose another category to see more handmade pieces." : "Our handmade collection will appear here soon."}</p>
            </div>`;
        return;
    }

    grid.innerHTML = visibleProducts.map(product => {
        const images = getProductImages(product);
        const imageHTML = images[0]
            ? `<img src="${images[0]}" alt="${escapeHTML(product.name)}">`
            : `<div class="product-placeholder">🧶</div>`;
        const priceHTML = product.salePrice
            ? `<del>₹${formatMoney(product.price)}</del> ₹${formatMoney(product.salePrice)}`
            : `₹${formatMoney(product.price)}`;

        return `
            <article class="product-card" onclick="openProduct('${product.id}')">
                <div class="product-image">${imageHTML}</div>
                <div class="product-info">
                    <div class="product-category-tag">${escapeHTML(product.category || "Uncategorized")}</div>
                    <h3>${escapeHTML(product.name)}</h3>
                    <p>${escapeHTML(product.description || "Handmade with love.")}</p>
                    <div class="product-bottom">
                        <span class="product-price">${priceHTML}</span>
                        ${product.saleLabel ? `<span class="sale-label">${escapeHTML(product.saleLabel)}</span>` : ""}
                        <button class="add-cart-btn" onclick="event.stopPropagation(); addToCart('${product.id}')" title="Add to cart" aria-label="Add ${escapeHTML(product.name)} to cart">+</button>
                    </div>
                </div>
            </article>`;
    }).join("");
}

function getProductImages(product) {
    if (Array.isArray(product.images) && product.images.length) return product.images.filter(Boolean);
    return product.image ? [product.image] : [];
}

function normalizeHeroSlide(slide) {
    if (typeof slide === "string") return { image: slide, productId: null };
    if (slide && typeof slide === "object") return { image: slide.image || "", productId: slide.productId || null };
    return { image: "", productId: null };
}

function getHeroSlideImage(slide) {
    return normalizeHeroSlide(slide).image;
}


/* =========================================================
   ADD TO CART
========================================================= */

function addToCart(productId) {

    const product =
        products.find(
            item => item.id === productId
        );

    if (!product) return;


    const existing =
        cart.find(
            item => item.id === productId
        );


    if (existing) {

        existing.quantity++;

    } else {

        cart.push({

            id: product.id,

            name: product.name,

            price: Number(product.salePrice || product.price),

            image: product.image,

            quantity: 1

        });

    }


    saveCart();

    renderCart();

    updateCartCount();

    openCart();

}


/* =========================================================
   CART
========================================================= */

function renderCart() {

    const container =
        document.getElementById("cartItems");

    const empty =
        document.getElementById("emptyCart");

    const totalElement =
        document.getElementById("cartTotal");


    if (!container) return;


    if (cart.length === 0) {

        container.innerHTML = "";

        empty.style.display = "flex";

        totalElement.textContent = "₹0";

        return;
    }


    empty.style.display = "none";


    container.innerHTML =
        cart.map(item => {

            const imageHTML =
                item.image

                    ? `
                        <img
                            src="${item.image}"
                            alt="${escapeHTML(item.name)}"
                        >
                    `

                    : `
                        <div class="cart-item-placeholder">
                            🧶
                        </div>
                    `;


            return `

                <div class="cart-item">

                    <div class="cart-item-image">
                        ${imageHTML}
                    </div>


                    <div>

                        <h4>
                            ${escapeHTML(item.name)}
                        </h4>

                        <div class="cart-item-price">
                            ₹${formatMoney(item.price)}
                        </div>


                        <div class="quantity-control">

                            <button
                                onclick="changeQuantity('${item.id}', -1)"
                            >
                                −
                            </button>

                            <span>
                                ${item.quantity}
                            </span>

                            <button
                                onclick="changeQuantity('${item.id}', 1)"
                            >
                                +
                            </button>

                        </div>

                    </div>


                    <button
                        class="cart-remove"
                        onclick="removeFromCart('${item.id}')"
                    >
                        ×
                    </button>

                </div>

            `;

        }).join("");


    const total =
        calculateCartTotal();

    totalElement.textContent =
        `₹${formatMoney(total)}`;

}


function calculateCartTotal() {

    return cart.reduce(
        (total, item) =>
            total + (item.price * item.quantity),
        0
    );

}


function changeQuantity(productId, amount) {

    const item =
        cart.find(
            item => item.id === productId
        );

    if (!item) return;


    item.quantity += amount;


    if (item.quantity <= 0) {

        cart =
            cart.filter(
                item => item.id !== productId
            );

    }


    saveCart();

    renderCart();

    updateCartCount();

}


function removeFromCart(productId) {

    cart =
        cart.filter(
            item => item.id !== productId
        );

    saveCart();

    renderCart();

    updateCartCount();

}


function updateCartCount() {

    const count =
        cart.reduce(
            (total, item) =>
                total + item.quantity,
            0
        );

    const element =
        document.getElementById("cartCount");

    if (element) {
        element.textContent = count;
    }

}


function openCart() {

    document
        .getElementById("cartDrawer")
        .classList.add("show");

    document
        .getElementById("cartOverlay")
        .classList.add("show");

}


function closeCart() {

    document
        .getElementById("cartDrawer")
        .classList.remove("show");

    document
        .getElementById("cartOverlay")
        .classList.remove("show");

}


/* =========================================================
   CHECKOUT
========================================================= */

function openCheckout() {

    if (cart.length === 0) {

        alert(
            "Your cart is empty. Add something cute first! 🧶"
        );

        return;
    }


    closeCart();


    document
        .getElementById("checkoutTotal")
        .textContent =
        `₹${formatMoney(calculateCartTotal())}`;


    const savedCustomer =
        JSON.parse(
            localStorage.getItem("miviCurrentCustomer")
        );


    if (savedCustomer) {

        document.getElementById("orderName").value =
            savedCustomer.name || "";

        document.getElementById("orderInstagram").value =
            savedCustomer.instagram || "";

        document.getElementById("orderPhone").value =
            savedCustomer.phone || "";

    }


    openModal("checkoutModal");

}


function closeCheckout() {

    closeModal("checkoutModal");

}


function placeOrder() {

    const name =
        document
            .getElementById("orderName")
            .value
            .trim();


    const instagram =
        document
            .getElementById("orderInstagram")
            .value
            .trim();


    const phone =
        document
            .getElementById("orderPhone")
            .value
            .trim();


    const message =
        document.getElementById(
            "checkoutMessage"
        );


    if (!name) {

        message.textContent =
            "Please enter your name.";

        return;
    }


    if (!instagram && !phone) {

        message.textContent =
            "Please enter your Instagram ID or phone number.";

        return;
    }


    const total =
        calculateCartTotal();


    const loggedInCustomer =
        getCurrentCustomer();


    const order = {

        id:
            "MIHA-" +
            Date.now().toString().slice(-6),

        name,

        instagram,

        phone,

        customerEmail:
            loggedInCustomer && loggedInCustomer.email
                ? loggedInCustomer.email
                : "",

        products:
            cart.map(item => ({
                ...item
            })),

        total,

        status: "Pending",

        paymentStatus: "Unpaid",

        date:
            new Date().toISOString()

    };


    orders.unshift(order);

    saveOrders();
    syncSharedState();


    /*
       Save/update customer
    */

    const existingCustomer =
        customers.find(
            customer =>
                customer.instagram &&
                customer.instagram.toLowerCase()
                === instagram.toLowerCase()
        );


    if (existingCustomer) {

        existingCustomer.name = name;

        existingCustomer.phone = phone;

        existingCustomer.orders =
            (existingCustomer.orders || 0) + 1;

    } else {

        customers.push({

            name,

            instagram,

            phone,

            orders: 1

        });

    }


    saveCustomers();


    /*
       Save current customer
       (merge with existing logged-in account so we don't
       wipe out email/password on checkout)
    */

    const existingSavedCustomer =
        getCurrentCustomer() || {};

   const safeCustomer = {
            ...existingSavedCustomer,
            name,
            instagram,
            phone,
        };
        delete safeCustomer.password;

        localStorage.setItem(
            "miviCurrentCustomer",
            JSON.stringify(safeCustomer)
        );


    /*
       Empty cart
    */

    cart = [];

    saveCart();

    renderCart();

    updateCartCount();


    closeCheckout();

    const adminDashboard =
        document.getElementById("adminDashboard");

    if (adminDashboard) {
        adminDashboard.classList.remove("show");
    }

    updateAdminDashboard();

    renderSuccessOrder(order);

    updateAccountUI();

    openModal("successModal");

}


function renderSuccessOrder(order) {

    const idField = document.getElementById("successOrderId");
    const itemsField = document.getElementById("successOrderItems");
    const totalField = document.getElementById("successOrderTotal");

    if (!idField || !itemsField || !totalField) return;

    idField.textContent = order.id;

    itemsField.innerHTML = order.products.map(item => `
        <div class="success-order-line">
            <span>${escapeHTML(item.name)} × ${item.quantity}</span>
            <strong>₹${formatMoney(item.price * item.quantity)}</strong>
        </div>
    `).join("");

    totalField.textContent = `₹${formatMoney(order.total)}`;

}


function closeSuccess() {

    closeModal("successModal");

}


/* =========================================================
   CUSTOMER LOGIN
========================================================= */

function getCurrentCustomer() {

    try {
        return JSON.parse(
            localStorage.getItem("miviCurrentCustomer")
        );
    } catch (error) {
        return null;
    }

}


function handleAccountClick() {

    const customer = getCurrentCustomer();

    if (customer && customer.email) {
        openProfile();
    } else {
        openLogin();
    }

}


function updateAccountUI() {

    const accountBtn = document.getElementById("accountBtn");
    const mobileAccountLink = document.getElementById("mobileAccountLink");

    const customer = getCurrentCustomer();

    const label =
        (customer && customer.email)
            ? (customer.name ? customer.name.split(" ")[0] : "Profile")
            : "Account";

    if (accountBtn) accountBtn.textContent = label;
    if (mobileAccountLink) mobileAccountLink.textContent = label;

}


function openLogin() {

    openModal("loginModal");

}


function closeLogin() {

    closeModal("loginModal");

}


function loginUser() {

    const email =
        document
            .getElementById("loginEmail")
            .value
            .trim()
            .toLowerCase();


    const password =
        document
            .getElementById("loginPassword")
            .value;


    const message =
        document.getElementById(
            "loginMessage"
        );


    if (
        email === adminData.id.toLowerCase()
        && password === adminData.password
    ) {
        closeLogin();
        openAdminDashboard();
        return;
    }

    const customer =
        customers.find(
            item =>
                item.email &&
                item.email.toLowerCase() === email &&
                item.password === password
        );


    if (!customer) {

        message.textContent =
            "Account not found or password is incorrect.";

        return;
    }


    localStorage.setItem(
        "miviCurrentCustomer",
        JSON.stringify(customer)
    );


    message.textContent =
        "Welcome back ♡";

    updateAccountUI();

    setTimeout(() => {

        closeLogin();

    }, 700);

}


function showCreateAccount() {

    closeLogin();

    openModal("createAccountModal");

}


function closeCreateAccount() {

    closeModal("createAccountModal");

}


function createAccount() {

    const name =
        document
            .getElementById("createName")
            .value
            .trim();


    const email =
        document
            .getElementById("createEmail")
            .value
            .trim()
            .toLowerCase();


    const phone =
        document
            .getElementById("createPhone")
            .value
            .trim();


    const password =
        document
            .getElementById("createPassword")
            .value;


    const message =
        document.getElementById(
            "createMessage"
        );


    if (!name || !email || !phone || !password) {

        message.textContent =
            "Please fill in every field.";

        return;
    }


    if (
        customers.some(
            customer =>
                customer.email &&
                customer.email.toLowerCase() === email
        )
    ) {

        message.textContent =
            "An account with this email already exists.";

        return;
    }


    const customer = {

        name,

        email,

        phone,

        password,

        orders: 0

    };


    customers.push(customer);

    saveCustomers();


   const safeCustomer = { ...customer };
delete safeCustomer.password;

localStorage.setItem(
    "miviCurrentCustomer",
    JSON.stringify(safeCustomer)
);


    message.textContent =
        "Account created successfully ♡";

    updateAccountUI();

    setTimeout(() => {

        closeCreateAccount();

    }, 900);

}


/* =========================================================
   CUSTOMER PROFILE
========================================================= */

function openProfile() {

    const customer = getCurrentCustomer();

    if (!customer) {
        openLogin();
        return;
    }

    syncSharedState();

    document.getElementById("profileName").textContent =
        customer.name || "MIHA Customer";

    document.getElementById("profileEmail").textContent =
        customer.email || "—";

    document.getElementById("profilePhone").textContent =
        customer.phone || "—";

    document.getElementById("profileInstagram").textContent =
        customer.instagram || "—";

    renderProfileOrders(customer);

    openModal("profileModal");

}


function closeProfile() {

    closeModal("profileModal");

}


function renderProfileOrders(customer) {

    const container = document.getElementById("profileOrders");
    if (!container) return;

    const myOrders = orders.filter(order =>
        (customer.email && order.customerEmail
            && order.customerEmail.toLowerCase() === customer.email.toLowerCase())
        || (customer.phone && order.phone
            && order.phone === customer.phone)
        || (customer.instagram && order.instagram
            && order.instagram.toLowerCase() === customer.instagram.toLowerCase())
    );

    if (myOrders.length === 0) {

        container.innerHTML = `
            <div class="no-products">
                <div>🧶</div>
                <h3>No orders yet</h3>
                <p>Your order history will appear here.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        myOrders.map(order => renderProfileOrderCard(order)).join("");

}


function renderProfileOrderCard(order) {

    const productsHTML = order.products.map(item => `
        <div class="order-product-line">
            <span>${escapeHTML(item.name)} × ${item.quantity}</span>
            <strong>₹${formatMoney(item.price * item.quantity)}</strong>
        </div>
    `).join("");

    return `
        <div class="order-card">

            <div class="order-header">
                <div>
                    <div class="order-number">${order.id}</div>
                    <div class="order-date">${formatDate(order.date)}</div>
                </div>
                <span class="order-status">${escapeHTML(order.status || "Pending")}</span>
            </div>

            <div class="order-products">
                ${productsHTML}
                <div class="order-total">
                    <span>Order Total</span>
                    <strong>₹${formatMoney(order.total)}</strong>
                </div>
            </div>

        </div>
    `;

}


function logoutCustomer() {

    localStorage.removeItem("miviCurrentCustomer");

    closeProfile();

    updateAccountUI();

}


/* =========================================================
   ADMIN LOGIN
========================================================= */

function showAdminLogin() {

    closeLogin();

    openModal("adminLoginModal");

}


function closeAdminLogin() {

    closeModal("adminLoginModal");

}


function loginAdmin() {

    const id =
        document
            .getElementById("adminEmail")
            .value
            .trim()
            .toLowerCase();


    const password =
        document
            .getElementById("adminPassword")
            .value;


    const message =
        document.getElementById(
            "adminMessage"
        );


    if (
        id === adminData.id.toLowerCase()
        &&
        password === adminData.password
    ) {

        message.textContent =
            "Opening dashboard...";


        setTimeout(() => {

            closeAdminLogin();

            openAdminDashboard();

        }, 400);

    } else {

        message.textContent =
            "Incorrect admin email or password.";

    }

}


/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function openAdminDashboard() {

    syncSharedState();

    document
        .getElementById("adminDashboard")
        .classList.add("show");

    updateAdminDashboard();

}


function adminLogout() {

    closeAddProduct();
    closeProduct();

    document
        .getElementById("adminDashboard")
        .classList.remove("show");

}


function showAdminSection(section, button) {

    document
        .querySelectorAll(".admin-section")
        .forEach(
            item => item.classList.remove("active")
        );


    document
        .querySelectorAll(".admin-nav")
        .forEach(
            item => item.classList.remove("active")
        );


    const target =
        document.getElementById(
            "admin" +
            capitalize(section)
        );


    if (target) {
        target.classList.add("active");
    }


    if (button) {
        button.classList.add("active");
    }


    updateAdminDashboard();

}


function showAdminSectionById(section) {

    const buttons =
        document.querySelectorAll(".admin-nav");


    let matchingButton = null;


    buttons.forEach(button => {

        if (
            button
                .textContent
                .toLowerCase()
                .includes(section)
        ) {

            matchingButton = button;

        }

    });


    showAdminSection(
        section,
        matchingButton
    );

}


function updateAdminDashboard() {

    const saleInput = document.getElementById("saleIdeaInput");
    if (saleInput) saleInput.value = saleIdea;

    updateStats();

    renderAdminProducts();
    renderAdminCategories();
    populateProductCategories();

    renderAdminOrders();

    renderRecentOrders();

    renderCustomers();
    updateBrandUI();
    renderAdminHeroSlides();

}


/* =========================================================
   ADMIN STATS
========================================================= */

function updateStats() {

    const totalSales =
        orders.reduce(
            (total, order) =>
                total + Number(order.total || 0),
            0
        );


    const pending =
        orders.filter(
            order =>
                order.status === "Pending"
        ).length;


    document.getElementById(
        "statSales"
    ).textContent =
        `₹${formatMoney(totalSales)}`;


    document.getElementById(
        "statOrders"
    ).textContent =
        orders.length;


    document.getElementById(
        "statPending"
    ).textContent =
        pending;


    document.getElementById(
        "statProducts"
    ).textContent =
        products.length;

}


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

function renderAdminProducts() {
    const container = document.getElementById("adminProductList");
    if (!container) return;
    if (!products.length) {
        container.innerHTML = `<div class="no-products"><div>🧶</div><h3>No products yet</h3><p>Add your first handmade product.</p></div>`;
        return;
    }
    container.innerHTML = products.map(product => {
        const images = getProductImages(product);
        const image = images[0] ? `<img src="${images[0]}" alt="${escapeHTML(product.name)}">` : `<div class="product-placeholder">🧶</div>`;
        return `
            <div class="admin-product-card">
                <div class="admin-product-card-image">${image}</div>
                <div class="admin-product-card-info">
                    <div class="product-category-tag">${escapeHTML(product.category || "Uncategorized")}</div>
                    <h3>${escapeHTML(product.name)}</h3>
                    <p>${escapeHTML(product.description || "No description.")}</p>
                    <small class="admin-photo-count">${images.length} photo${images.length === 1 ? "" : "s"} • click product to view gallery</small>
                    <div class="admin-product-card-bottom">
                        <strong>${product.salePrice ? `<del>₹${formatMoney(product.price)}</del> ₹${formatMoney(product.salePrice)}` : `₹${formatMoney(product.price)}`}</strong>
                        <button class="small-btn" onclick="editProductSale('${product.id}')">Sale</button>
                        <button class="delete-btn" onclick="deleteProduct('${product.id}')">Delete</button>
                    </div>
                </div>
            </div>`;
    }).join("");
}


function deleteProduct(productId) {

    const product =
        products.find(
            item => item.id === productId
        );


    if (!product) return;


    showConfirm(
        `Delete "${product.name}"?`,
        "Delete",
        () => {

            products =
                products.filter(
                    item => item.id !== productId
                );


            /*
               Also remove it from carts
            */

            cart =
                cart.filter(
                    item => item.id !== productId
                );


            saveProducts();

            saveCart();

            renderProducts();

            renderCart();

            updateCartCount();

            updateAdminDashboard();

        }
    );

}


/* =========================================================
   ADD PRODUCT
========================================================= */

let selectedProductImage = "";
let selectedProductImages = [];


function openAddProduct() {

    resetProductForm();

    const modal = document.getElementById("addProductModal");
    if (!modal) return;

    openModal("addProductModal");

}


function closeAddProduct() {

    closeModal("addProductModal");

}


function resetProductForm() {

    document.getElementById(
        "productName"
    ).value = "";


    document.getElementById(
        "productPrice"
    ).value = "";

    const categorySelect = document.getElementById("productCategory");
    if (categorySelect) {
        populateProductCategories();
        categorySelect.value = "";
    }


    document.getElementById(
        "productDescription"
    ).value = "";

    document.getElementById("productSalePrice").value = "";
    document.getElementById("productSaleLabel").value = "";


    document.getElementById(
        "productImage"
    ).value = "";


    document.getElementById(
        "productMessage"
    ).textContent = "";


    selectedProductImage = "";
    selectedProductImages = [];


    const preview =
        document.getElementById(
            "imagePreview"
        );


    preview.src = "";

    preview.style.display = "none";


    document.getElementById(
        "uploadText"
    ).style.display = "block";

    const multiPreview = document.getElementById("productImagesPreview");
    if (multiPreview) multiPreview.innerHTML = "";

}


function compressImageFile(file, maxDimension, quality) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onerror = () => reject(new Error("Could not read file"));

        reader.onload = (e) => {

            const img = new Image();

            img.onerror = () => reject(new Error("Could not load image"));

            img.onload = () => {

                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round(height * (maxDimension / width));
                        width = maxDimension;
                    } else {
                        width = Math.round(width * (maxDimension / height));
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL("image/jpeg", quality));

            };

            img.src = e.target.result;

        };

        reader.readAsDataURL(file);

    });

}


function previewProductImage(event) {
    const files = Array.from(event.target.files || [])
        .filter(file => file.type.startsWith("image/"));
    if (!files.length) return;

    if (files.length > 5) {
        alert("You can upload up to 5 product photos.");
    }

    Promise.all(files.slice(0, 5).map(file => compressImageFile(file, 700, 0.65)))
        .then(images => {
            selectedProductImages = images;
            selectedProductImage = images[0] || "";

            const preview = document.getElementById("imagePreview");
            const text = document.getElementById("uploadText");
            const multiPreview = document.getElementById("productImagesPreview");

            if (preview) {
                preview.src = selectedProductImage;
                preview.style.display = selectedProductImage ? "block" : "none";
            }
            if (text) text.style.display = "none";
            if (multiPreview) {
                multiPreview.innerHTML = images.map((src, index) =>
                    `<img src="${src}" alt="Product photo ${index + 1}">`
                ).join("");
            }
            event.target.value = "";
        })
        .catch(() => alert("Could not process those photos. Please try different images."));
}


function addProduct() {
    const name = document.getElementById("productName").value.trim();
    const price = Number(document.getElementById("productPrice").value);
    const category = document.getElementById("productCategory").value.trim();
    const description = document.getElementById("productDescription").value.trim();
    const salePriceValue = Number(document.getElementById("productSalePrice").value);
    const saleLabel = document.getElementById("productSaleLabel").value.trim();
    const message = document.getElementById("productMessage");

    if (!name) return message.textContent = "Please enter the product name.";
    if (!category) return message.textContent = "Please select a product category.";
    if (!selectedProductImages.length) return message.textContent = "Please upload at least one product photo.";
    if (!price || price <= 0) return message.textContent = "Please enter a valid price.";

    const product = {
        id: "product-" + Date.now(),
        name,
        price,
        description,
        category,
        images: selectedProductImages,
        image: selectedProductImages[0],
        salePrice: salePriceValue > 0 && salePriceValue < price ? salePriceValue : null,
        saleLabel
    };

    products.unshift(product);
    renderProducts();
    updateAdminDashboard();
    message.textContent = "Saving...";

    saveProducts().then(() => {
        message.textContent = "Product added successfully ♡";
        renderAdminHeroSlides();
        setTimeout(() => closeAddProduct(), 800);
    }).catch(() => {
        products = products.filter(item => item.id !== product.id);
        renderProducts();
        updateAdminDashboard();
        message.textContent = "Could not save — check your internet connection and try again.";
    });
}


function saveSaleIdea() {
    const input = document.getElementById("saleIdeaInput");
    if (!input) return;

    const value = input.value.trim();
    saleIdea = value;

    const banner = document.getElementById("customerSaleBanner");
    const bannerText = document.getElementById("customerSaleIdea");
    if (bannerText) bannerText.textContent = saleIdea;
    if (banner) banner.style.display = saleIdea ? "block" : "none";

    saveSaleIdeaToCloud();
}


function editProductSale(productId) {

    const product = products.find(item => item.id === productId);
    if (!product) return;

    const salePrice = prompt(
        `Sale price for ${product.name} (leave blank to remove sale):`,
        product.salePrice || ""
    );

    if (salePrice === null) return;

    const numericSalePrice = Number(salePrice);
    if (salePrice.trim() &&
        (!numericSalePrice || numericSalePrice >= Number(product.price))) {
        alert("Sale price must be lower than the regular price.");
        return;
    }

    const saleLabel = prompt(
        "Sale label (for example, 20% OFF):",
        product.saleLabel || ""
    );

    if (saleLabel === null) return;

    product.salePrice = salePrice.trim() ? numericSalePrice : null;
    product.saleLabel = saleLabel.trim();

    saveProducts().catch(() => {});
    renderProducts();
    updateAdminDashboard();
}


/* =========================================================
   ADMIN ORDERS
========================================================= */

function renderAdminOrders() {

    const container =
        document.getElementById(
            "adminOrdersList"
        );


    if (!container) return;


    if (orders.length === 0) {

        container.innerHTML = `

            <div class="no-products">

                <div>🧺</div>

                <h3>No orders yet</h3>

                <p>
                    Customer orders will appear here.
                </p>

            </div>

        `;

        return;
    }


    container.innerHTML =
        orders.map(order => {

            return renderOrderCard(order);

        }).join("");

}


function renderOrderCard(order) {

    const productsHTML =
        order.products.map(item => {

            return `

                <div class="order-product-line">

                    <span>
                        ${escapeHTML(item.name)}
                        × ${item.quantity}
                    </span>

                    <strong>
                        ₹${formatMoney(
                            item.price * item.quantity
                        )}
                    </strong>

                </div>

            `;

        }).join("");


    return `

        <div class="order-card">

            <div class="order-header">

                <div>

                    <div class="order-number">
                        ${order.id}
                    </div>

                    <div class="order-date">
                        ${formatDate(order.date)}
                    </div>

                </div>

                <span class="order-status">
                    ${escapeHTML(order.status || "Pending")}
                </span>

            </div>


            <div class="order-customer">

                <div class="customer-detail">
                    <small>Name</small>
                    <strong>
                        ${escapeHTML(order.name)}
                    </strong>
                </div>

                <div class="customer-detail">
                    <small>Instagram</small>
                    <strong>
                        ${escapeHTML(order.instagram || "—")}
                    </strong>
                </div>

                <div class="customer-detail">
                    <small>Phone</small>
                    <strong>
                        ${escapeHTML(order.phone || "—")}
                    </strong>
                </div>

                <div class="customer-detail">
                    <small>Email</small>
                    <strong>
                        ${escapeHTML(order.email || "—")}
                    </strong>
                </div>

            </div>


            <div class="order-products">

                ${productsHTML}

                <div class="order-total">

                    <span>
                        Order Total
                    </span>

                    <strong>
                        ₹${formatMoney(order.total)}
                    </strong>

                </div>

            </div>

            <div class="order-controls">

                <label>
                    <span>Status</span>
                    <select onchange="updateOrderStatus('${order.id}', this.value)">
                        ${renderOrderStatusOptions(order.status)}
                    </select>
                </label>

                <label>
                    <span>Payment</span>
                    <select onchange="updateOrderPayment('${order.id}', this.value)">
                        ${renderPaymentOptions(order.paymentStatus)}
                    </select>
                </label>

                <button class="order-cancel-btn" onclick="cancelOrder('${order.id}')">
                    Cancel Order
                </button>

                <button class="order-delete-btn" onclick="deleteOrder('${order.id}')">
                    Delete
                </button>

            </div>

        </div>

    `;

}


function renderOrderStatusOptions(status) {

    const currentStatus = status || "Pending";
    const statuses = [
        "Pending",
        "Processing",
        "Delivered",
        "Cancelled"
    ];

    return statuses.map(option => `
        <option value="${option}" ${option === currentStatus ? "selected" : ""}>
            ${option}
        </option>
    `).join("");

}


function renderPaymentOptions(paymentStatus) {

    const currentPayment = paymentStatus || "Unpaid";

    return ["Unpaid", "Paid"].map(option => `
        <option value="${option}" ${option === currentPayment ? "selected" : ""}>
            ${option}
        </option>
    `).join("");

}


function updateOrderStatus(orderId, status) {

    const order = orders.find(item => item.id === orderId);
    if (!order) return;

    order.status = status;
    saveOrders();
    syncSharedState();
    updateAdminDashboard();

}


function updateOrderPayment(orderId, paymentStatus) {

    const order = orders.find(item => item.id === orderId);
    if (!order) return;

    order.paymentStatus = paymentStatus;
    saveOrders();
    syncSharedState();
    updateAdminDashboard();

}


function cancelOrder(orderId) {

    const order = orders.find(item => item.id === orderId);
    if (!order) return;

    order.status = "Cancelled";
    saveOrders();
    syncSharedState();
    updateAdminDashboard();

}


function deleteOrder(orderId) {

    showConfirm(
        "Delete this order permanently?",
        "Delete",
        () => {

            orders = orders.filter(item => item.id !== orderId);
            saveOrders();
            syncSharedState();
            updateAdminDashboard();

        }
    );

}


/* =========================================================
   RECENT ORDERS
========================================================= */

function renderRecentOrders() {

    const container =
        document.getElementById(
            "recentOrders"
        );


    if (!container) return;


    const recent =
        orders.slice(0, 5);


    if (recent.length === 0) {

        container.innerHTML = `

            <div class="no-products">

                <div>♡</div>

                <p>
                    Your first order will appear here.
                </p>

            </div>

        `;

        return;
    }


    container.innerHTML =
        recent.map(order => {

            return `

                <div
                    style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    padding:14px 0;
                    border-bottom:1px solid rgba(60,52,64,.07);
                    "
                >

                    <div>

                        <strong
                            style="
                            display:block;
                            font-size:13px;
                            "
                        >
                            ${escapeHTML(order.name)}
                        </strong>

                        <small
                            style="
                            color:#999;
                            font-size:10px;
                            "
                        >
                            ${order.id}
                        </small>

                    </div>

                    <strong>
                        ₹${formatMoney(order.total)}
                    </strong>

                </div>

            `;

        }).join("");

}


/* =========================================================
   CUSTOMERS
========================================================= */

function renderCustomers() {

    const container =
        document.getElementById(
            "adminCustomersList"
        );


    if (!container) return;


    if (customers.length === 0) {

        container.innerHTML = `

            <div class="no-products">

                <div>♡</div>

                <h3>No customers yet</h3>

            </div>

        `;

        return;
    }


    container.innerHTML =
        customers.map(customer => {

            const firstLetter =
                customer.name
                    ? customer.name
                        .charAt(0)
                        .toUpperCase()
                    : "M";


            return `

                <div class="customer-card">

                    <div class="customer-avatar">
                        ${escapeHTML(firstLetter)}
                    </div>

                    <h3>
                        ${escapeHTML(customer.name)}
                    </h3>

                    <p>
                        Instagram:
                        ${escapeHTML(
                            customer.instagram || "Not provided"
                        )}
                    </p>

                    <p>
                        Phone:
                        ${escapeHTML(
                            customer.phone || "Not provided"
                        )}
                    </p>

                    <p>
                        Orders:
                        ${customer.orders || 0}
                    </p>

                </div>

            `;

        }).join("");

}


/* =========================================================
   ADMIN PASSWORD
========================================================= */

function changeAdminPassword() {

    const id =
        document
            .getElementById("settingsAdminId")
            .value
            .trim();


    const password =
        document
            .getElementById(
                "settingsAdminPassword"
            )
            .value;


    const message =
        document.getElementById(
            "settingsMessage"
        );


    if (!id) {

        message.textContent =
            "Please enter an admin ID.";

        return;
    }


    if (password.length < 6) {

        message.textContent =
            "Password must contain at least 6 characters.";

        return;
    }


    adminData.id =
        id;

    adminData.password =
        password;


    saveAdmin();


    message.textContent =
        "Admin details updated successfully ♡";


    document.getElementById(
        "settingsAdminPassword"
    ).value = "";

}


/* =========================================================
   MODAL HELPERS
========================================================= */

function openModal(id) {

    const element =
        document.getElementById(id);


    if (element) {

        element.classList.add("show");

        document.body.style.overflow =
            "hidden";

    }

}


function closeModal(id) {

    const element =
        document.getElementById(id);


    if (element) {

        element.classList.remove("show");

        document.body.style.overflow =
            "";

    }

}


let productDetailImages = [];
let productDetailIndex = 0;
let productDetailTouchStartX = 0;

function renderProductDetailGallery(product) {
    const gallery = document.getElementById("productDetailGallery");
    if (!gallery) return;
    productDetailImages = getProductImages(product);
    if (!productDetailImages.length) productDetailImages = [""];
    productDetailIndex = Math.max(0, Math.min(productDetailIndex, productDetailImages.length - 1));

    gallery.innerHTML = `
        <div class="product-detail-main-image" id="productDetailSwipeArea">
            ${productDetailImages[productDetailIndex]
                ? `<img src="${productDetailImages[productDetailIndex]}" alt="${escapeHTML(product.name)} photo ${productDetailIndex + 1}" draggable="false">`
                : `<div class="product-placeholder">🧶</div>`}
            ${productDetailImages.length > 1 ? `
                <button class="product-detail-arrow detail-prev" onclick="changeProductDetailImage(-1)">‹</button>
                <button class="product-detail-arrow detail-next" onclick="changeProductDetailImage(1)">›</button>` : ""}
        </div>
        ${productDetailImages.length > 1 ? `<div class="product-detail-thumbs">${productDetailImages.map((src, i) => `<button class="detail-thumb ${i === productDetailIndex ? "active" : ""}" onclick="goToProductDetailImage(${i})"><img src="${src}" alt="Thumbnail ${i + 1}"></button>`).join("")}</div>` : ""}
        ${productDetailImages.length > 1 ? `<div class="product-detail-counter">${productDetailIndex + 1} / ${productDetailImages.length}</div>` : ""}
    `;
    setupProductDetailSwipe();
}

function goToProductDetailImage(index) {
    productDetailIndex = (index + productDetailImages.length) % productDetailImages.length;
    const product = window.__mihaOpenProduct;
    if (product) renderProductDetailGallery(product);
}

function changeProductDetailImage(direction) {
    productDetailIndex = (productDetailIndex + direction + productDetailImages.length) % productDetailImages.length;
    const currentProduct = window.__mihaOpenProduct;
    if (currentProduct) renderProductDetailGallery(currentProduct);
}

function setupProductDetailSwipe() {
    const area = document.getElementById("productDetailSwipeArea");
    if (!area || area.dataset.swipeReady === "true") return;
    area.dataset.swipeReady = "true";
    area.addEventListener("touchstart", e => { productDetailTouchStartX = e.touches[0].clientX; }, { passive: true });
    area.addEventListener("touchend", e => {
        const delta = e.changedTouches[0].clientX - productDetailTouchStartX;
        if (Math.abs(delta) > 45) changeProductDetailImage(delta < 0 ? 1 : -1);
    }, { passive: true });
}

function openProduct(productId) {
    const product = products.find(item => item.id === productId);
    const detail = document.getElementById("productDetailContent");
    if (!product || !detail) return;
    window.__mihaOpenProduct = product;
    productDetailIndex = 0;

    detail.innerHTML = `
        <div class="product-detail-gallery-wrap" id="productDetailGallery"></div>
        <div class="product-detail-info">
            <span class="eyebrow">${escapeHTML(product.category || "HANDMADE BY MIHA")}</span>
            <h2>${escapeHTML(product.name)}</h2>
            <strong class="product-detail-price">
                ${product.salePrice ? `<del>₹${formatMoney(product.price)}</del> ₹${formatMoney(product.salePrice)}` : `₹${formatMoney(product.price)}`}
            </strong>
            <p>${escapeHTML(product.description || "Handmade with love.")}</p>
            <button class="primary-btn full-btn" onclick="addToCart('${product.id}'); closeProduct()">Add to basket ♡</button>
        </div>`;
    renderProductDetailGallery(product);
    openModal("productDetailModal");
}


function closeProduct() {
    closeModal("productDetailModal");
}


/* =========================================================
   MOBILE MENU
========================================================= */

function toggleMobileMenu() {

    document
        .getElementById("mobileMenu")
        .classList.toggle("show");

}


/* =========================================================
   UTILITIES
========================================================= */

function formatMoney(number) {

    return Number(number || 0)
        .toLocaleString("en-IN");

}


function formatDate(date) {

    return new Date(date)
        .toLocaleString(
            "en-IN",
            {
                dateStyle: "medium",
                timeStyle: "short"
            }
        );

}


function capitalize(text) {

    return text.charAt(0).toUpperCase()
        + text.slice(1);

}


function escapeHTML(value) {

    if (value === undefined || value === null) {
        return "";
    }


    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

}


/* =========================================================
   ESCAPE KEY
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Escape") {
            return;
        }


        closeCart();

        closeLogin();

        closeCreateAccount();

        closeProfile();

        closeAdminLogin();

        closeCheckout();

        closeSuccess();

        closeAddProduct();

        closeConfirm();

    }
);
