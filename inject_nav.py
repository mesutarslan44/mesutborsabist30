import os
import glob

html_files = glob.glob('site/*.html')

inject_block = """
    <!-- Floating Action & Bottom Nav -->
    <button class="scroll-top-btn" id="scrollTopBtn" aria-label="Yukari Cik">
        <svg viewBox="0 0 24 24"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>
    </button>
    <nav class="bottom-nav">
        <div class="bottom-nav-inner">
            <a href="index.html" class="bottom-nav-link" id="navBist">
                <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
                <span>BIST 30</span>
            </a>
            <a href="agbe.html" class="bottom-nav-link" id="navAgbe">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 13.5v1.5h-2v-1.5H8.5c-.83 0-1.5-.67-1.5-1.5v-2c0-.83.67-1.5 1.5-1.5h3v-1.5H8.5v-2H10V7h2v1.5h2.5c.83 0 1.5.67 1.5 1.5v2c0 .83-.67 1.5-1.5 1.5h-3v1.5h3v2z"/></svg>
                <span>AGBE</span>
            </a>
            <a href="tutturduklarim.html" class="bottom-nav-link" id="navPerfBist">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                <span>Sonuç (B)</span>
            </a>
            <a href="agbe_tutturduklarim.html" class="bottom-nav-link" id="navPerfAgbe">
                <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
                <span>Sonuç (A)</span>
            </a>
        </div>
    </nav>
    <script>
        (function(){
            var path = window.location.pathname;
            if(path.includes('agbe_tutturduklarim')) document.getElementById('navPerfAgbe').classList.add('active-agbe');
            else if(path.includes('tutturduklarim')) document.getElementById('navPerfBist').classList.add('active');
            else if(path.includes('agbe')) document.getElementById('navAgbe').classList.add('active-agbe');
            else if(!path.includes('hisse')) document.getElementById('navBist').classList.add('active');

            var scrollBtn = document.getElementById('scrollTopBtn');
            window.addEventListener('scroll', function() {
                if(window.scrollY > 300) scrollBtn.classList.add('visible');
                else scrollBtn.classList.remove('visible');
            });
            scrollBtn.addEventListener('click', function() {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        })();
    </script>
</body>
"""

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # If already injected, skip
    if 'id="scrollTopBtn"' in content:
        print(f"Skipping {file}, already injected.")
        continue
        
    # Inject before </body>
    content = content.replace('</body>', inject_block)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
        print(f"Injected into {file}")
