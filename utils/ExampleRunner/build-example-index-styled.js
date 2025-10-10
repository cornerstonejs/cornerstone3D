const fs = require('fs');
const path = require('path');

/**
 * Builds a styled index page with categorized examples
 * @param {Array} names - Array of example names
 * @param {Array} exampleBasePaths - Array of example base paths
 * @returns {String} HTML content for the index page
 */
module.exports = function buildExampleIndexStyled(names, exampleBasePaths) {
  // Load the example info JSON
  const exampleInfoPath = path.join(__dirname, 'example-info.json');
  let exampleInfo = {
    categories: {},
    examplesByCategory: {}
  };

  try {
    const exampleInfoContent = fs.readFileSync(exampleInfoPath, 'utf8');
    exampleInfo = JSON.parse(exampleInfoContent);
  } catch (error) {
    console.warn('Could not load example-info.json:', error.message);
  }

  const categories = exampleInfo.categories || {};
  const examplesByCategory = exampleInfo.examplesByCategory || {};

  // Build category sections
  let categoryHtml = '';

  Object.keys(examplesByCategory).forEach(categoryId => {
    const category = categories[categoryId] || { description: categoryId };
    const examples = examplesByCategory[categoryId];
    
    if (!examples || Object.keys(examples).length === 0) {
      return;
    }

    // Count how many examples exist for this category
    const existingExamples = Object.keys(examples).filter(exampleId => 
      names.includes(exampleId)
    );

    if (existingExamples.length === 0) {
      return;
    }

    categoryHtml += `
      <section class="category-section">
        <h2 class="category-title">
          <span class="category-icon">📁</span>
          ${category.description}
          <span class="category-count">${existingExamples.length} example${existingExamples.length !== 1 ? 's' : ''}</span>
        </h2>
        <div class="examples-grid">
    `;

    // Add examples in this category
    existingExamples.forEach(exampleId => {
      const example = examples[exampleId];
      const index = names.indexOf(exampleId);
      
      if (index === -1) {
        return;
      }

      categoryHtml += `
          <a href="${exampleId}.html" class="example-card">
            <div class="example-card-header">
              <h3 class="example-card-title">${example.name}</h3>
            </div>
            <p class="example-card-description">${example.description}</p>
            <div class="example-card-footer">
              <span class="example-card-link">View Example →</span>
            </div>
          </a>
      `;
    });

    categoryHtml += `
        </div>
      </section>
    `;
  });

  // Add any examples not in the JSON (fallback)
  const uncategorizedExamples = names.filter(name => {
    // Check if this example exists in any category
    for (const categoryId in examplesByCategory) {
      if (examplesByCategory[categoryId][name]) {
        return false;
      }
    }
    return true;
  });

  if (uncategorizedExamples.length > 0) {
    categoryHtml += `
      <section class="category-section">
        <h2 class="category-title">
          <span class="category-icon">📦</span>
          Other Examples
          <span class="category-count">${uncategorizedExamples.length} example${uncategorizedExamples.length !== 1 ? 's' : ''}</span>
        </h2>
        <div class="examples-grid">
    `;

    uncategorizedExamples.forEach(name => {
      categoryHtml += `
          <a href="${name}.html" class="example-card">
            <div class="example-card-header">
              <h3 class="example-card-title">${name}</h3>
            </div>
            <p class="example-card-description">View this example</p>
            <div class="example-card-footer">
              <span class="example-card-link">View Example →</span>
            </div>
          </a>
      `;
    });

    categoryHtml += `
        </div>
      </section>
    `;
  }

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-type" content="text/html; charset=utf-8"/>
    <meta name="viewport" content="width=device-width, height=device-height, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
    <title>Cornerstone3D Examples</title>
    <link rel="icon" href="https://www.cornerstonejs.org/img/favicon.ico" />
    <style>
      :root {
        --primary-blue: #5acce6;
        --dark-bg: #090B2B;
        --darker-bg: #090B2B;
        --card-bg: #0f1330;
        --text-light: #ffffff;
        --text-gray: #94a3b8;
        --border-color: #1a1d3f;
        --hover-bg: #1a1d3f;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
          'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
          sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        background: var(--dark-bg);
        color: var(--text-light);
        min-height: 100vh;
      }

      .header {
        background: var(--darker-bg);
        border-bottom: 1px solid var(--border-color);
        padding: 2rem;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      }

      .header-content {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 0.25rem;
      }

      .logo {
        display: inline-flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }


      .header h1 {
        font-size: 2.5rem;
        font-weight: 700;
        color: var(--text-light);
        margin-bottom: 0.5rem;
      }

      .header p {
        font-size: 1.125rem;
        color: var(--text-gray);
        max-width: 600px;
        margin: 0 auto 1.5rem;
        line-height: 1.6;
      }

      .header-links {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
      }

      .header-link {
        padding: 0.75rem 1.5rem;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        color: var(--text-light);
        text-decoration: none;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }

      .header-link:hover {
        background: var(--primary-blue);
        border-color: var(--primary-blue);
        transform: translateY(-2px);
      }

      .header-link.primary {
        background: var(--primary-blue);
        border-color: var(--primary-blue);
        font-weight: 500;
      }

      .examples-link {
        padding: 0.5rem 1.25rem;
        color: var(--text-light);
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
        background: rgba(90, 204, 230, 0.1);
        border-radius: 6px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
      }

      .examples-link::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, rgba(90, 204, 230, 0.2) 0%, rgba(90, 204, 230, 0) 100%);
        opacity: 0;
        transition: opacity 0.3s;
      }

      .examples-link:hover {
        background: rgba(90, 204, 230, 0.15);
        color: var(--primary-blue);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(90, 204, 230, 0.2);
      }

      .examples-link:hover::before {
        opacity: 1;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1.5rem 0.25rem;
      }

      .search-box {
        margin-bottom: 2rem;
        position: relative;
      }

      .search-input {
        width: 100%;
        padding: 1rem 1rem 1rem 3rem;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        color: var(--text-light);
        font-size: 1rem;
        transition: all 0.2s;
      }

      .search-input:focus {
        outline: none;
        border-color: var(--primary-blue);
        box-shadow: 0 0 0 3px rgba(90, 204, 230, 0.1);
      }

      .search-icon {
        position: absolute;
        left: 1rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-gray);
        font-size: 1.25rem;
      }

      .category-section {
        margin-bottom: 3rem;
      }

      .category-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--text-light);
        margin-bottom: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .category-icon {
        font-size: 1.5rem;
      }

      .category-count {
        font-size: 0.875rem;
        color: var(--text-gray);
        font-weight: 400;
        margin-left: auto;
      }

      .examples-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1.5rem;
      }

      .example-card {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 1.5rem;
        text-decoration: none;
        color: var(--text-light);
        transition: all 0.2s;
        display: flex;
        flex-direction: column;
        cursor: pointer;
      }

      .example-card:hover {
        border-color: var(--primary-blue);
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
      }

      .example-card-header {
        margin-bottom: 0.75rem;
      }

      .example-card-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-light);
        line-height: 1.4;
      }

      .example-card-description {
        font-size: 0.875rem;
        color: var(--text-gray);
        line-height: 1.6;
        flex: 1;
        margin-bottom: 1rem;
      }

      .example-card-footer {
        display: flex;
        justify-content: flex-end;
      }

      .example-card-link {
        color: var(--primary-blue);
        font-size: 0.875rem;
        font-weight: 500;
        transition: all 0.2s;
      }

      .example-card:hover .example-card-link {
        transform: translateX(4px);
        display: inline-block;
      }

      .footer {
        background: var(--darker-bg);
        border-top: 1px solid var(--border-color);
        padding: 2rem 2rem 1rem;
        margin-top: 4rem;
      }

      .footer-content {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 0.25rem;
      }

      .footer-columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 2rem;
        margin-bottom: 2rem;
      }

      .footer-column h4 {
        color: var(--text-light);
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 1rem;
      }

      .footer-column ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .footer-column ul li {
        margin-bottom: 0.5rem;
      }

      .footer-column a {
        color: var(--text-gray);
        text-decoration: none;
        transition: color 0.2s;
      }

      .footer-column a:hover {
        color: var(--primary-blue);
      }

      .footer-bottom {
        text-align: center;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border-color);
      }

      .footer-bottom p {
        margin: 0;
        color: var(--text-gray);
        font-size: 0.875rem;
      }

      .stats {
        display: flex;
        gap: 2rem;
        justify-content: center;
        flex-wrap: wrap;
        margin-top: 1rem;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
      }

      .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--primary-blue);
      }

      .stat-label {
        font-size: 0.875rem;
        color: var(--text-gray);
      }

      @media (max-width: 768px) {
        .header h1 {
          font-size: 2rem;
        }

        .examples-grid {
          grid-template-columns: 1fr;
        }

        .container {
          padding: 1.5rem 0.75rem;
        }
      }

      .hidden {
        display: none !important;
      }
    </style>
  </head>
  <body>
    <header class="header">
      <div class="header-content">
        <div class="logo">
          <img src="https://www.cornerstonejs.org/img/cornerstone-dark.png" alt="Cornerstone3D" style="height: 60px; width: auto; display: block;" />
        </div>
        <h1>Cornerstone3D Examples</h1>
        <p>
          Explore interactive examples demonstrating the powerful features of Cornerstone3D,
          the modern medical imaging library for the web.
        </p>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${names.length}</div>
            <div class="stat-label">Examples</div>
          </div>
          <div class="stat">
            <div class="stat-value">${Object.keys(categories).length}</div>
            <div class="stat-label">Categories</div>
          </div>
        </div>
      </div>
    </header>

    <main class="container">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          id="search" 
          class="search-input" 
          placeholder="Search examples by name or description..."
          autocomplete="off"
        />
      </div>

      <div id="examples-container">
        ${categoryHtml}
      </div>
    </main>

    <footer class="footer">
      <div class="footer-content">
        <div class="footer-columns">
          <div class="footer-column">
            <h4>Learn</h4>
            <ul>
              <li><a href="https://www.cornerstonejs.org/" target="_blank" rel="noopener noreferrer">Documentation</a></li>
              <li><a href="https://www.cornerstonejs.org/docs/getting-started" target="_blank" rel="noopener noreferrer">Getting Started</a></li>
              <li><a href="https://www.cornerstonejs.org/docs/faq" target="_blank" rel="noopener noreferrer">FAQ</a></li>
            </ul>
          </div>
          <div class="footer-column">
            <h4>Community</h4>
            <ul>
              <li><a href="https://github.com/cornerstonejs/cornerstone3D/discussions" target="_blank" rel="noopener noreferrer">Discussion Board</a></li>
              <li><a href="https://github.com/cornerstonejs/cornerstone3D/issues" target="_blank" rel="noopener noreferrer">Help</a></li>
              <li><a href="https://discord.gg/zNMGVFxNtv" target="_blank" rel="noopener noreferrer">Discord</a></li>
            </ul>
          </div>
          <div class="footer-column">
            <h4>More</h4>
            <ul>
              <li><a href="https://github.com/cornerstonejs/cornerstone3D" target="_blank" rel="noopener noreferrer">GitHub</a></li>
              <li><a href="https://twitter.com/cornerstonejs" target="_blank" rel="noopener noreferrer">Twitter</a></li>
              <li><a href="https://www.ohif.org/" target="_blank" rel="noopener noreferrer">OHIF Viewer</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <p>Cornerstone is open source software released under the MIT license.</p>
        </div>
      </div>
    </footer>

    <script>
      // Search functionality
      const searchInput = document.getElementById('search');
      const examplesContainer = document.getElementById('examples-container');

      searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const categoryLections = examplesContainer.querySelectorAll('.category-section');

        categoryLections.forEach(section => {
          const cards = section.querySelectorAll('.example-card');
          let visibleCount = 0;

          cards.forEach(card => {
            const title = card.querySelector('.example-card-title').textContent.toLowerCase();
            const description = card.querySelector('.example-card-description').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || description.includes(searchTerm)) {
              card.classList.remove('hidden');
              visibleCount++;
            } else {
              card.classList.add('hidden');
            }
          });

          // Hide category if no visible cards
          if (visibleCount === 0) {
            section.classList.add('hidden');
          } else {
            section.classList.remove('hidden');
          }
        });
      });

      // Add keyboard shortcut for search (Ctrl+K or Cmd+K)
      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          searchInput.focus();
        }
      });
    </script>
  </body>
</html>
  `;
};

