# Kontinensek topója – adatelőállítás

`npm run data:world` = `derive.py` (Python 3 + numpy; a matplotlib csak az előnézeti képhez kell) és `build.ts` (Node).
Forrás: `shp/ne_110m_land.*` (Natural Earth 1:110m, v4.1.0, közkincs), csak olvasásra.
Részletes leírás, határvonalak és döntések: [0004 task](../../../docs/project/tasks/0004_CONTINENTS_TOPIC/task.md).

Ha egy szigetet máshova kell sorolni, vagy egy óceánhatárt máshol kell húzni, a `derive.py` `ISLANDS` vagy `OCEAN_CUTS` táblázatát kell módosítani. Utána új `DATA_VERSION`, `npm run data:world`, és a `topicRegistry.ts` adatverzióját is frissíteni kell.
