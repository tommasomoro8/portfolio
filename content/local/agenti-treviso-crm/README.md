# Sales Agents Association CRM

A membership CRM for [Agenti Treviso](https://www.agentitreviso.it/), an association of sales agents: member records, contact history and membership fees.

<!-- portfolio:summary
## The problem
[Agenti Treviso](https://www.agentitreviso.it/), an association of sales agents, was running on an old management program that had become obsolete. Replacing it was my first paid project for a real client.

## The solution
A web CRM where staff keep each member's record and a timeline of contacts, consultations and payments. Edits appear live in every open session, so the data stays in sync and organized in one place, in a simple interface that keeps everything in view. I'm working on smarter features, with the help of AI, so the association never loses touch with any of its members.

## Challenges
- Working for a paying client: for the first time I had to meet firm deadlines and put a value on my work in time and money.
- Sync between staff sessions: every write is broadcast over Socket.IO and each client patches its open views without reloading, while handling the race conditions of two people editing the same record at once.
- Traceability: nothing is overwritten silently. Every change to a member or event is logged, so it's always possible to see what a record looked like before.

## What I learned
- Designing everything before writing code, first with the client and then on the technical side, cuts development time considerably.
- Relying on Firebase and Algolia ties an app meant to run for years to services that can deprecate features or break compatibility. The second version I'm working on removes them and runs in Docker.
- A codebase this size needs types: I'm writing the second version in TypeScript.

## Stack
Node.js, Express, Socket.IO, Firebase (Firestore, Auth, Storage), Algolia, ExcelJS, JavaScript, HTML, CSS
-->
