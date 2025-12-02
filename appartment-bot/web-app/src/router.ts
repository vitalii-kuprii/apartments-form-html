export class Router {
  private routes: Map<string, () => void> = new Map();
  private currentRoute: string = '/';

  constructor() {
    window.addEventListener('hashchange', () => this.handleRouteChange());
    window.addEventListener('load', () => this.handleRouteChange());
  }

  addRoute(path: string, render: () => void) {
    this.routes.set(path, render);
  }

  navigate(path: string) {
    window.location.hash = path;
  }

  private handleRouteChange() {
    const hash = window.location.hash.slice(1) || '/';
    this.currentRoute = hash;

    const render = this.routes.get(hash);
    if (render) {
      render();
    } else {
      this.navigate('/');
    }

    this.updateNavigation();
  }

  private updateNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href === `#${this.currentRoute}`) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
      page.classList.remove('active');
    });

    const activePage = document.querySelector(`[data-route="${this.currentRoute}"]`);
    if (activePage) {
      activePage.classList.add('active');
    }
  }

  getCurrentRoute(): string {
    return this.currentRoute;
  }
}
