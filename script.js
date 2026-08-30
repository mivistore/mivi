/* =========================================================
   MIVI — MAIN JAVASCRIPT
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
    },

    {
        id: "mivi-002",
        name: "Blue Cloud",
        price: 499,
        description: "A dreamy handmade cloud for your cutest corner.",
        image: "",
    },

    {
        id: "mivi-003",
        name: "Cute Mini Bear",
        price: 699,
        description: "A tiny handmade bear looking for a new home.",
        image: "",
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

let heroPhoto = "";

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
        heroPhoto
    }, { merge: true })
        .then(() => updateSyncIndicator("saved"))
        .catch(error => {
            console.error("saveHeroPhoto failed:", error);
            updateSyncIndicator("error");
        });

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

        if (typeof renderProducts === "function") renderProducts();
        if (typeof renderAdminProducts === "function") renderAdminProducts();
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
            const banner = document.getElementById("customerSaleIdea");
            if (banner) banner.textContent = saleIdea;
        }
        if (typeof data.heroPhoto === "string" && data.heroPhoto) {
            heroPhoto = data.heroPhoto;
            if (typeof renderHeroPhoto === "function") renderHeroPhoto();
        }

    }, error => console.error("settings listener failed:", error));

}


/* =========================================================
   PAGE START
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    startLiveSync();

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

    const saleBanner = document.getElementById("customerSaleIdea");
    if (saleBanner) saleBanner.textContent = saleIdea;

    renderCart();

    updateCartCount();

    updateAdminDashboard();

    renderHeroPhoto();

    updateAccountUI();

});


function renderHeroPhoto() {

    const preview = document.getElementById("heroPhotoPreview");
    const uploadBox = document.getElementById("heroPhotoUpload");

    if (!preview || !uploadBox || !heroPhoto) return;

    preview.src = heroPhoto;
    preview.classList.add("show");
    uploadBox.classList.add("has-photo");

}


function previewHeroPhoto(event) {

    const file = event.target.files[0];

    if (!file || !file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
    }

    compressImageFile(file, 1200, 0.8).then(dataUrl => {

        heroPhoto = dataUrl;
        saveHeroPhoto();
        renderHeroPhoto();

        const preview = document.getElementById("adminHeroPhotoPreview");
        const text = document.getElementById("adminHeroPhotoText");

        preview.src = heroPhoto;
        preview.style.display = "block";
        text.style.display = "none";

    }).catch(() => {

        alert("Could not process that photo. Please try a different image.");

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

    const grid =
        document.getElementById("productGrid");

    if (!grid) return;


    if (products.length === 0) {

        grid.innerHTML = `

            <div class="no-products">

                <div>🧶</div>

                <h3>Something cute is coming...</h3>

                <p>
                    Our handmade collection will appear here soon.
                </p>

            </div>

        `;

        return;
    }


    grid.innerHTML = products.map(product => {

        const imageHTML =
            product.image

                ? `
                    <img
                        src="${product.image}"
                        alt="${escapeHTML(product.name)}"
                    >
                `

                : `
                    <div class="product-placeholder">
                        🧶
                    </div>
                `;


        return `

            <article class="product-card" onclick="openProduct('${product.id}')">

                <div class="product-image">

                    ${imageHTML}

                </div>


                <div class="product-info">

                    <h3>
                        ${escapeHTML(product.name)}
                    </h3>

                    <p>
                        ${escapeHTML(
                            product.description
                            || "Handmade with love."
                        )}
                    </p>


                    <div class="product-bottom">

                        <span class="product-price">
                            ₹${formatMoney(product.price)}
                        </span>

                        <button
                            class="add-cart-btn"
                            onclick="event.stopPropagation(); addToCart('${product.id}')"
                            title="Add to cart"
                        >
                            +
                            <span class="product-price">
                                ${product.salePrice
                                    ? `<del>₹${formatMoney(product.price)}</del> ₹${formatMoney(product.salePrice)}`
                                    : `₹${formatMoney(product.price)}`}
                            </span>

                            ${product.saleLabel
                                ? `<span class="sale-label">${escapeHTML(product.saleLabel)}</span>`
                                : ""}
                        </button>

                    </div>

                </div>

            </article>

        `;

    }).join("");

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
            "MIVI-" +
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

    localStorage.setItem(
        "miviCurrentCustomer",
        JSON.stringify({
            ...existingSavedCustomer,
            name,
            instagram,
            phone,
        })
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


    localStorage.setItem(
        "miviCurrentCustomer",
        JSON.stringify(customer)
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
        customer.name || "MIVI Customer";

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

    renderAdminOrders();

    renderRecentOrders();

    renderCustomers();

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

    const container =
        document.getElementById(
            "adminProductList"
        );


    if (!container) return;


    if (products.length === 0) {

        container.innerHTML = `
            <div class="no-products">
                <div>🧶</div>
                <h3>No products yet</h3>
                <p>Add your first handmade product.</p>
            </div>
        `;

        return;
    }


    container.innerHTML =
        products.map(product => {

            const image =
                product.image

                    ? `
                        <img
                            src="${product.image}"
                            alt="${escapeHTML(product.name)}"
                        >
                    `

                    : `
                        <div
                            class="product-placeholder"
                        >
                            🧶
                        </div>
                    `;


            return `

                <div class="admin-product-card">

                    <div class="admin-product-card-image">

                        ${image}

                    </div>


                    <div class="admin-product-card-info">

                        <h3>
                            ${escapeHTML(product.name)}
                        </h3>

                        <p>
                            ${escapeHTML(
                                product.description
                                || "No description."
                            )}
                        </p>


                        <div
                            class="admin-product-card-bottom"
                        >

                            <strong>
                                ${product.salePrice
                                    ? `<del>₹${formatMoney(product.price)}</del> ₹${formatMoney(product.salePrice)}`
                                    : `₹${formatMoney(product.price)}`}
                            </strong>

                            <button
                                class="small-btn"
                                onclick="editProductSale('${product.id}')"
                            >
                                Sale
                            </button>

                            <button
                                class="delete-btn"
                                onclick="deleteProduct('${product.id}')"
                            >
                                Delete
                            </button>

                        </div>

                    </div>

                </div>

            `;

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


    const preview =
        document.getElementById(
            "imagePreview"
        );


    preview.src = "";

    preview.style.display = "none";


    document.getElementById(
        "uploadText"
    ).style.display = "block";

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

    const file =
        event.target.files[0];


    if (!file) return;


    if (!file.type.startsWith("image/")) {

        alert(
            "Please choose an image file."
        );

        return;
    }


    compressImageFile(file, 900, 0.8).then(dataUrl => {

        selectedProductImage = dataUrl;


        const preview =
            document.getElementById(
                "imagePreview"
            );


        preview.src =
            selectedProductImage;


        preview.style.display =
            "block";


        document.getElementById(
            "uploadText"
        ).style.display =
            "none";

    }).catch(() => {

        alert(
            "Could not process that photo. Please try a different image."
        );

    });

}


function addProduct() {

    const name =
        document
            .getElementById("productName")
            .value
            .trim();


    const price =
        Number(
            document
                .getElementById("productPrice")
                .value
        );


    const description =
        document
            .getElementById("productDescription")
            .value
            .trim();

    const salePriceValue = Number(
        document.getElementById("productSalePrice").value
    );

    const saleLabel = document
        .getElementById("productSaleLabel")
        .value
        .trim();


    const message =
        document.getElementById(
            "productMessage"
        );


    if (!name) {

        message.textContent =
            "Please enter the product name.";

        return;
    }


    if (!selectedProductImage) {

        message.textContent =
            "Please upload a product image.";

        return;
    }


    if (!price || price <= 0) {

        message.textContent =
            "Please enter a valid price.";

        return;
    }


    const product = {

        id:
            "product-" +
            Date.now(),

        name,

        price,

        description,

        image:
            selectedProductImage,

        salePrice:
            salePriceValue > 0 && salePriceValue < price
                ? salePriceValue
                : null,

        saleLabel

    };


    products.unshift(product);

    renderProducts();

    updateAdminDashboard();

    message.textContent =
        "Saving...";

    saveProducts().then(() => {

        message.textContent =
            "Product added successfully ♡";

        setTimeout(() => {

            closeAddProduct();
            closeProduct();

        }, 800);

    }).catch(() => {

        /*
           Save failed — undo the optimistic local add so the
           product doesn't appear to exist when it never actually
           reached the cloud (this is exactly what caused it to
           vanish again on refresh).
        */

        products = products.filter(item => item.id !== product.id);

        renderProducts();

        updateAdminDashboard();

        message.textContent =
            "Could not save — check your internet connection and try again.";

    });

}


function saveSaleIdea() {

    const input = document.getElementById("saleIdeaInput");
    if (!input) return;

    const value = input.value.trim();
    if (!value) return;

    saleIdea = value;
    saveSaleIdeaToCloud();

    const banner = document.getElementById("customerSaleIdea");
    if (banner) banner.textContent = saleIdea;
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


function openProduct(productId) {

    const product = products.find(item => item.id === productId);
    const detail = document.getElementById("productDetailContent");

    if (!product || !detail) return;

    detail.innerHTML = `
        <div class="product-detail-image">
            ${product.image
                ? `<img src="${product.image}" alt="${escapeHTML(product.name)}">`
                : `<div class="product-placeholder">🧶</div>`}
        </div>
        <div class="product-detail-info">
            <span class="eyebrow">HANDMADE BY MIVI</span>
            <h2>${escapeHTML(product.name)}</h2>
            <strong class="product-detail-price">
                ${product.salePrice
                    ? `<del>₹${formatMoney(product.price)}</del> ₹${formatMoney(product.salePrice)}`
                    : `₹${formatMoney(product.price)}`}
            </strong>
            <p>${escapeHTML(product.description || "Handmade with love.")}</p>
            <button class="primary-btn full-btn" onclick="addToCart('${product.id}'); closeProduct()">
                Add to basket ♡
            </button>
        </div>
    `;

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
