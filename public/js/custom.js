// Custom JavaScript for SCARF site

document.addEventListener("DOMContentLoaded", function () {
  // Add copyright text to footer
  const footerMeta = document.querySelector(".md-footer-meta");
  if (footerMeta && !document.querySelector(".custom-copyright")) {
    const copyrightDiv = document.createElement("div");
    copyrightDiv.className = "custom-copyright";
    copyrightDiv.style.cssText = "text-align: right; width: 100%; padding-top: 0.5rem; color: var(--md-default-fg-color--light); font-size: 0.85rem; font-style: italic;";
    copyrightDiv.innerHTML = "IBM © 2025. Made with ❤️ for the developer community from IBM Research.";
    footerMeta.appendChild(copyrightDiv);
  }
});
