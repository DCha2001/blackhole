#pragma once

class Blackhole
{
	private:
		float x, y, z;
		float radius;
		unsigned int VBO, VAO;
		int verticesCount = 100;

		unsigned int getVBO();

		unsigned int getVAO();



	public:
		Blackhole(float x, float y, float z, float radius);

		~Blackhole();

		void draw();

		void update();

};

