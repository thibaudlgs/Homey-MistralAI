'use strict';

module.exports = {
  async getZones({ homey }) {
    if (!homey.app.homeyApi) {
      throw new Error('Homey Web API not initialized yet.');
    }
    return await homey.app.homeyApi.zones.getZones();
  },
  
  async getDevices({ homey }) {
    if (!homey.app.homeyApi) {
      throw new Error('Homey Web API not initialized yet.');
    }
    return await homey.app.homeyApi.devices.getDevices();
  },

  async getTasks({ homey }) {
    return homey.app.getScheduledTasks();
  },

  async deleteTask({ homey, params }) {
    const taskId = params.id;
    if (!taskId) throw new Error('Task ID is required.');
    homey.app.cancelScheduledTask(taskId);
    return { success: true };
  }
};
