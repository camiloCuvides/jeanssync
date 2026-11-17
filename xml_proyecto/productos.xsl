<?xml version="1.0" encoding="UTF-8"?>
<!-- =========================================================
     productos.xsl
     Hoja de transformación XSLT 1.0: convierte productos.xml
     (catálogo de JeansSync) en un reporte HTML de inventario.
     ========================================================= -->
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <!-- El resultado será HTML, con sangría para que sea legible -->
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <!-- Plantilla principal: se aplica al elemento raíz -->
  <xsl:template match="/productos">
    <html>
      <head>
        <title>Catálogo <xsl:value-of select="@tienda"/></title>
        <style>
          body  { font-family: Arial, sans-serif; margin: 24px; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #999; padding: 6px 10px; }
          th    { background: #1f3a5f; color: #fff; }
          .bajo { background: #ffd6d6; }
          .sin  { color: #888; font-style: italic; }
        </style>
      </head>
      <body>
        <!-- Valores leídos de los atributos del elemento raíz -->
        <h1>Catálogo de jeans · <xsl:value-of select="@tienda"/></h1>
        <p>Fecha del reporte: <xsl:value-of select="@fecha"/></p>

        <table>
          <tr>
            <th>Referencia</th><th>Producto</th><th>Sección</th>
            <th>Precio (COP)</th><th>Unidades</th><th>Descripción</th>
          </tr>

          <!-- Recorre cada producto: primero por sección y, dentro de
               cada sección, del precio más alto al más bajo -->
          <xsl:for-each select="producto">
            <xsl:sort select="@categoria"/>
            <xsl:sort select="precio" data-type="number" order="descending"/>
            <tr>
              <!-- Si quedan menos de 10 unidades, la fila se marca en rojo -->
              <xsl:if test="unidades &lt; 10">
                <xsl:attribute name="class">bajo</xsl:attribute>
              </xsl:if>
              <td><xsl:value-of select="referencia"/></td>
              <td><xsl:value-of select="nombre"/></td>
              <td><xsl:value-of select="@categoria"/></td>
              <td><xsl:value-of select="precio"/></td>
              <td><xsl:value-of select="unidades"/></td>
              <td>
                <!-- descripcion es opcional: xsl:choose funciona como si / si no -->
                <xsl:choose>
                  <xsl:when test="descripcion">
                    <xsl:value-of select="descripcion"/>
                  </xsl:when>
                  <xsl:otherwise>
                    <span class="sin">Sin descripción</span>
                  </xsl:otherwise>
                </xsl:choose>
              </td>
            </tr>
          </xsl:for-each>
        </table>

        <!-- Funciones XPath usadas dentro de XSLT -->
        <p>Total de productos: <xsl:value-of select="count(producto)"/></p>
        <p>Unidades disponibles: <xsl:value-of select="sum(producto/unidades)"/></p>
        <p>Productos con poco inventario (menos de 10 unidades):
           <xsl:value-of select="count(producto[unidades &lt; 10])"/></p>
        <p>Filas en rojo: productos con menos de 10 unidades.</p>
      </body>
    </html>
  </xsl:template>

</xsl:stylesheet>
