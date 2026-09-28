"""
Prueba de carga del Inventario IT (auditoria 27-sep-2026, 2.14).

Simula tecnicos y administradores que inician sesion y recorren las pantallas
y consultas mas usadas. Solo LEE: no crea ni modifica datos, asi que se puede
correr contra un ambiente de pruebas con datos reales de volumen.

NUNCA contra produccion sin avisar: el perfil "estres" esta hecho para
encontrar el punto donde la app deja de responder.

Requisitos:
    pip install locust

Credenciales (de una cuenta de prueba, nunca escritas en este archivo):
    CARGA_EMAIL=tecnico.prueba@empresa.cl
    CARGA_PASSWORD=...

Uso (desde app/scripts/carga):
    PERFIL=normal      locust -f locustfile.py --host http://localhost:3000 --headless
    PERFIL=pico        locust -f locustfile.py --host https://staging.ejemplo.cl --headless
    PERFIL=estres      ...
    PERFIL=resistencia ...
  Sin --headless abre la interfaz web en http://localhost:8089.
  Agrega --csv resultados para guardar los tiempos.

Perfiles (usuarios simultaneos a lo largo del tiempo):
    normal       20 usuarios durante 5 min: un dia tipico.
    pico         sube a 80 en 1 min, se mantiene 5 min y baja: inicio de mes,
                 onboarding masivo.
    estres       sube de a 25 usuarios cada 2 min hasta 250: busca el limite.
    resistencia  40 usuarios durante 60 min: fugas de memoria o de conexiones
                 (en Neon, revisar que las conexiones no crezcan sin parar).

Que mirar en el resultado:
    - p95 de las paginas bajo 2 s y de la API bajo 1 s en "normal".
    - 0 % de errores en "normal" y "pico".
    - En "estres", en que cantidad de usuarios empiezan los errores 5xx o los
      tiempos se disparan: ese es el techo actual.

Nota sobre el bloqueo de inicio de sesion: todos los usuarios simulados
entran con la misma cuenta. Los ingresos correctos no cuentan para el
bloqueo, pero si la clave esta mal, en 5 intentos la cuenta queda bloqueada
15 minutos (SPEC 2.112 / 2.113). Revisa CARGA_PASSWORD antes de subir usuarios.
"""

import os
import random

from locust import HttpUser, LoadTestShape, between, task

EMAIL = os.environ.get("CARGA_EMAIL")
PASSWORD = os.environ.get("CARGA_PASSWORD")
PERFIL = os.environ.get("PERFIL", "normal")

if not EMAIL or not PASSWORD:
    raise SystemExit("Define CARGA_EMAIL y CARGA_PASSWORD con una cuenta de prueba.")


class UsuarioInventario(HttpUser):
    # Una persona real no hace clic sin pausa.
    wait_time = between(2, 6)

    def on_start(self):
        """Inicia sesion igual que el navegador: token CSRF y luego credenciales."""
        r = self.client.get("/api/auth/csrf", name="login: csrf")
        csrf = r.json().get("csrfToken")
        r = self.client.post(
            "/api/auth/callback/credentials",
            data={"csrfToken": csrf, "email": EMAIL, "password": PASSWORD, "json": "true"},
            allow_redirects=False,
            name="login: credenciales",
        )
        # NextAuth responde 200 (json=true) o 302; con error redirige a /login?error=...
        ubicacion = r.headers.get("location", "") + r.text[:200]
        if r.status_code >= 400 or "error=" in ubicacion:
            raise SystemExit(f"No se pudo iniciar sesion ({r.status_code}). Revisa las credenciales.")

    # --- Paginas (se arman en el servidor: incluyen sus consultas) ---------

    @task(5)
    def dashboard(self):
        self.client.get("/", name="pagina: dashboard")

    @task(4)
    def activos(self):
        self.client.get("/activos", name="pagina: activos")

    @task(3)
    def solicitudes(self):
        self.client.get("/solicitudes", name="pagina: solicitudes")

    @task(1)
    def despachos(self):
        self.client.get("/despachos", name="pagina: despachos")

    @task(1)
    def mantenciones(self):
        self.client.get("/mantenciones", name="pagina: mantenciones")

    # --- Consultas de la API que hacen esas pantallas ----------------------

    @task(6)
    def listar_activos(self):
        pagina = random.randint(1, 5)
        self.client.get(f"/api/activos?page={pagina}&limit=10", name="api: activos (lista)")

    @task(3)
    def buscar_activos(self):
        termino = random.choice(["dell", "lenovo", "hp", "iphone", "samsung", "notebook"])
        self.client.get(f"/api/activos?search={termino}&limit=10", name="api: activos (busqueda)")

    @task(3)
    def listar_solicitudes(self):
        self.client.get("/api/solicitudes?page=1&limit=10", name="api: solicitudes")

    @task(1)
    def listar_despachos(self):
        self.client.get("/api/guias-despacho?page=1&limit=10", name="api: despachos")
        self.client.get("/api/guias-despacho/resumen", name="api: despachos (resumen)")

    @task(1)
    def mantenciones_pendientes(self):
        self.client.get("/api/mantenciones/pendientes", name="api: mantenciones pendientes")

    @task(2)
    def sesion(self):
        # El navegador la revisa cada 30 s (SessionProvider).
        self.client.get("/api/auth/session", name="api: sesion")


# (duracion acumulada en segundos, usuarios, usuarios nuevos por segundo)
ETAPAS = {
    "normal": [(300, 20, 2)],
    "pico": [(60, 80, 2), (360, 80, 2), (420, 0, 5)],
    "estres": [(120 * (i + 1), 25 * (i + 1), 2) for i in range(10)],
    "resistencia": [(3600, 40, 2)],
}


class Perfil(LoadTestShape):
    """Elige las etapas segun la variable PERFIL."""

    def tick(self):
        etapas = ETAPAS.get(PERFIL)
        if etapas is None:
            raise SystemExit(f"PERFIL desconocido: {PERFIL}. Usa: {', '.join(ETAPAS)}")
        tiempo = self.get_run_time()
        for hasta, usuarios, ritmo in etapas:
            if tiempo < hasta:
                return usuarios, ritmo
        return None
