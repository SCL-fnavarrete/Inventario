/*
  Warnings:

  - You are about to drop the column `termination_id` on the `workflow_requests` table. All the data in the column will be lost.
  - You are about to drop the `terminations` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "EstadoActivo" ADD VALUE 'no_devuelto';

-- DropForeignKey
ALTER TABLE "terminations" DROP CONSTRAINT "terminations_employee_id_fkey";

-- AlterTable
ALTER TABLE "workflow_requests" DROP COLUMN "termination_id";

-- DropTable
DROP TABLE "terminations";
